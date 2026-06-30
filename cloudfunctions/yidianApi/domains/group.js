const { createAuthContext, requireCurrentUser } = require("../common/auth");
const {
  formatDateKey,
  getCurrentMonthLifecycle,
  getNextMonthLifecycle,
  resolveGroupStatusByLifecycle
} = require("../common/date");
const { AppError, ErrorCodes } = require("../common/errors");
const { calculateGroupStats } = require("../common/stats");
const { ensureGroupLifecycle } = require("../common/groupLifecycle");

const MAX_MEMBERS = 50;
const GROUP_NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9 _\-\u00b7()（）]{1,20}$/;
const NICKNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9 _\-\u00b7()（）]{1,12}$/;
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assertWriteRequestId(event) {
  const requestId = trimString(event && event.requestId);
  if (!requestId) {
    throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field: "requestId" });
  }
  return requestId;
}

function normalizeGroupName(value) {
  const name = trimString(value);
  if (!GROUP_NAME_RE.test(name)) {
    throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field: "name" });
  }
  return name;
}

function normalizeNickname(value) {
  const nickname = trimString(value);
  if (!NICKNAME_RE.test(nickname)) {
    throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field: "nickname" });
  }
  return nickname;
}

function resolveCreatorNickname(payload) {
  return normalizeNickname(payload.nickname);
}

function createInviteCode() {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

async function findOne(collection, query) {
  const result = await collection.where(query).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function findMany(collection, query) {
  const result = await collection.where(query).get();
  return result.data || [];
}

async function createUniqueInviteCode(db) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = createInviteCode();
    const existing = await findOne(db.collection("groups"), { inviteCode });
    if (!existing) {
      return inviteCode;
    }
  }

  throw new AppError(ErrorCodes.COMMON_SYSTEM_ERROR, "", { reason: "INVITE_CODE_RETRY_EXHAUSTED" });
}

async function findCreateGroupAudit(db, actorUserId, requestId) {
  return findOne(db.collection("auditLogs"), {
    actionType: "GROUP_CREATE",
    actorUserId,
    requestId,
    result: "success"
  });
}

async function findMembership(db, groupId, userId) {
  return findOne(db.collection("memberships"), { groupId, userId });
}

async function findTargetConfig(db, groupId, membershipId, monthKey) {
  return findOne(db.collection("targetConfigs"), { groupId, membershipId, monthKey });
}

async function findGroupByInviteCode(db, inviteCode) {
  return findOne(db.collection("groups"), { inviteCode });
}

async function findGroupById(db, groupId) {
  return findOne(db.collection("groups"), { _id: groupId });
}

async function findJoinAudit(db, actorUserId, requestId) {
  const joinAudit = await findOne(db.collection("auditLogs"), {
    actionType: "MEMBER_JOIN",
    actorUserId,
    requestId,
    result: "success"
  });

  if (joinAudit) {
    return joinAudit;
  }

  return findOne(db.collection("auditLogs"), {
    actionType: "MEMBER_REJOIN",
    actorUserId,
    requestId,
    result: "success"
  });
}

async function findActionAudit(db, actionType, actorUserId, requestId) {
  return findOne(db.collection("auditLogs"), {
    actionType,
    actorUserId,
    requestId,
    result: "success"
  });
}

async function writeAuditLog(db, data) {
  await db.collection("auditLogs").add({ data });
}

async function runCreateStage(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    const details = error && error.details && typeof error.details === "object"
      ? error.details
      : {};
    error.details = { ...details, stage };
    throw error;
  }
}

async function createUnsetTargetConfig(db, data) {
  const addResult = await db.collection("targetConfigs").add({
    data: {
      groupId: data.groupId,
      membershipId: data.membershipId,
      userId: data.userId,
      monthKey: data.monthKey,
      status: "unset",
      coinValue: 0,
      selectedGoalTypes: [],
      goals: {},
      createdAt: data.now,
      updatedAt: data.now,
      createdBy: data.userId,
      updatedBy: data.userId
    }
  });

  return addResult._id;
}

async function ensureTargetConfig(db, data) {
  const existing = await findTargetConfig(db, data.groupId, data.membershipId, data.monthKey);
  if (existing) {
    return existing._id;
  }
  return createUnsetTargetConfig(db, data);
}

function normalizeInviteCode(value) {
  const inviteCode = trimString(value).toUpperCase();
  if (!/^[A-Z2-9]{6,12}$/.test(inviteCode)) {
    throw new AppError(ErrorCodes.GROUP_INVITE_INVALID, "", { field: "inviteCode" });
  }
  return inviteCode;
}

function normalizeId(value, field) {
  const id = trimString(value);
  if (!id) {
    throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field });
  }
  return id;
}

function assertGroupJoinable(group, options = {}) {
  const checkCapacity = options.checkCapacity !== false;

  if (!group || group.inviteStatus !== "active") {
    throw new AppError(ErrorCodes.GROUP_INVITE_INVALID, "", {});
  }

  if (group.status === "archived") {
    throw new AppError(ErrorCodes.GROUP_ARCHIVED, "", { groupId: group._id });
  }

  if (group.status === "dissolved") {
    throw new AppError(ErrorCodes.GROUP_DISSOLVED, "", {});
  }

  if (group.status !== "upcoming" && group.status !== "active") {
    throw new AppError(ErrorCodes.GROUP_INVITE_INVALID, "", {});
  }

  if (checkCapacity && (group.activeMemberCount || 0) >= (group.maxMembers || MAX_MEMBERS)) {
    throw new AppError(ErrorCodes.GROUP_FULL, "", { groupId: group._id });
  }
}

function toJoinPreview(group, membership) {
  const alreadyMember = Boolean(membership && membership.status === "active");

  return {
    groupId: group._id,
    name: group.name,
    monthKey: group.monthKey,
    status: group.status,
    lifecycleStartAt: group.lifecycleStartAt,
    lifecycleEndAt: group.lifecycleEndAt,
    activeMemberCount: group.activeMemberCount || 0,
    maxMembers: group.maxMembers || MAX_MEMBERS,
    alreadyMember,
    membershipStatus: membership ? membership.status : "none",
    creatorNickname: group.creatorNickname || "",
    visibilityTips: {
      photos: true,
      remarks: true,
      targets: true,
      statistics: true
    }
  };
}

function toJoinResult({ group, membershipId, targetConfigId, activePeriodSeq, joinedType, alreadyMember }) {
  return {
    groupId: group._id,
    membershipId,
    targetConfigId,
    status: "active",
    groupStatus: group.status,
    monthKey: group.monthKey,
    activeMemberCount: group.activeMemberCount || 0,
    activePeriodSeq,
    joinedType,
    alreadyMember: Boolean(alreadyMember)
  };
}

function assertGroupReadable(group) {
  if (!group) {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", {});
  }

  if (group.status === "dissolved") {
    throw new AppError(ErrorCodes.GROUP_DISSOLVED, "", {});
  }

  if (group.status === "archived") {
    throw new AppError(ErrorCodes.GROUP_ARCHIVED, "", { groupId: group._id });
  }

  if (group.status !== "upcoming" && group.status !== "active") {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", {});
  }
}

function assertActiveMembership(membership) {
  if (!membership) {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", {});
  }

  if (membership.status !== "active") {
    throw new AppError(ErrorCodes.MEMBER_NOT_ACTIVE, "", { membershipId: membership._id });
  }
}

function assertCreatorMembership(membership) {
  assertActiveMembership(membership);

  if (membership.role !== "creator") {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", { membershipId: membership._id });
  }
}

function closeActivePeriods(activePeriods, now, endReason) {
  const periods = Array.isArray(activePeriods) ? activePeriods.slice() : [];
  const lastIndex = periods.length - 1;

  if (lastIndex >= 0 && !periods[lastIndex].endAt) {
    periods[lastIndex] = {
      ...periods[lastIndex],
      endAt: now,
      endReason
    };
  }

  return periods;
}

function decrementActiveMemberCount(group) {
  return Math.max((group.activeMemberCount || 0) - 1, 0);
}

function createTargetSummary(targetConfig) {
  if (!targetConfig) {
    return {
      targetConfigId: "",
      status: "unset",
      selectedGoalCount: 0,
      coinValue: 0
    };
  }

  return {
    targetConfigId: targetConfig._id,
    status: targetConfig.status || "unset",
    selectedGoalCount: Array.isArray(targetConfig.selectedGoalTypes) ? targetConfig.selectedGoalTypes.length : 0,
    coinValue: Number(targetConfig.coinValue || 0)
  };
}

function summarizeRecords(records, todayKey) {
  const validRecords = records.filter((record) => record.status === "valid" || record.status === "edited");
  const lastSportDate = validRecords
    .map((record) => record.sportDate)
    .filter(Boolean)
    .sort()
    .pop() || null;

  return {
    validRecordCount: validRecords.length,
    todayChecked: validRecords.some((record) => record.sportDate === todayKey),
    lastSportDate
  };
}

function toMemberDetail(member, targetConfig, records, todayKey) {
  const targetSummary = createTargetSummary(targetConfig);
  const recordSummary = summarizeRecords(records, todayKey);

  return {
    membershipId: member._id,
    userId: member.userId,
    nickname: member.nickname,
    role: member.role,
    activePeriodSeq: member.activePeriodSeq || 1,
    joinedAt: member.joinedAt || null,
    targetSummary,
    recordSummary,
    summaryTextType: targetSummary.status === "unset" ? "targetUnset" : "targetSet"
  };
}

function toManagementMember(member, targetConfig, creatorMembershipId) {
  const isCreator = member._id === creatorMembershipId || member.role === "creator";

  return {
    membershipId: member._id,
    userId: member.userId,
    nickname: member.nickname,
    role: member.role,
    joinedAt: member.joinedAt || null,
    targetSummary: createTargetSummary(targetConfig),
    canTransferCreator: !isCreator,
    canRemove: !isCreator
  };
}

function toCreateGroupResult({ groupId, membershipId, targetConfigId, group }) {
  return {
    groupId,
    membershipId,
    targetConfigId,
    name: group.name,
    inviteCode: group.inviteCode,
    status: group.status,
    monthKey: group.monthKey,
    lifecycleStartAt: group.lifecycleStartAt,
    lifecycleEndAt: group.lifecycleEndAt,
    activeMemberCount: group.activeMemberCount,
    maxMembers: group.maxMembers
  };
}

module.exports = {
  async getHomeEntry({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const activeMemberships = await findMany(db.collection("memberships"), {
      userId: currentUser.userId,
      status: "active"
    });
    const activeGroups = await findMany(db.collection("groups"), { status: "active" });
    const upcomingGroups = await findMany(db.collection("groups"), { status: "upcoming" });
    const currentGroupById = new Map(activeGroups.concat(upcomingGroups).map((group) => [group._id, group]));
    const userTargets = await findMany(db.collection("targetConfigs"), { userId: currentUser.userId });
    const targetByMembershipAndMonth = new Map(userTargets.map((targetConfig) => [
      `${targetConfig.membershipId}:${targetConfig.monthKey}`,
      targetConfig
    ]));
    const currentGroups = activeMemberships
      .map((membership) => {
        const group = currentGroupById.get(membership.groupId);
        if (!group) {
          return null;
        }
        const targetConfig = targetByMembershipAndMonth.get(`${membership._id}:${group.monthKey}`);
        return {
          groupId: group._id,
          name: group.name,
          status: group.status,
          monthKey: group.monthKey,
          lifecycleStartAt: group.lifecycleStartAt,
          lifecycleEndAt: group.lifecycleEndAt,
          activeMemberCount: group.activeMemberCount || 0,
          maxMembers: group.maxMembers || MAX_MEMBERS,
          membershipId: membership._id,
          role: membership.role,
          nickname: membership.nickname,
          targetSummary: createTargetSummary(targetConfig)
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.status === right.status) {
          return String(left.lifecycleStartAt || "").localeCompare(String(right.lifecycleStartAt || ""));
        }
        return left.status === "active" ? -1 : 1;
      });
    const snapshots = await findMany(db.collection("archiveSnapshots"), { status: "active" });
    const archiveSummaries = snapshots
      .filter((snapshot) => Array.isArray(snapshot.visibleUserIds) && snapshot.visibleUserIds.includes(currentUser.userId))
      .map((snapshot) => ({
        archiveSnapshotId: snapshot._id,
        groupId: snapshot.groupId,
        groupName: snapshot.groupName,
        monthKey: snapshot.monthKey,
        archivedAt: snapshot.archivedAt,
        activeMemberCount: snapshot.activeMemberCount || 0,
        completedMemberCount: snapshot.completedMemberCount || 0,
        groupCompletionRate: snapshot.groupCompletionRate
      }))
      .sort((left, right) => String(right.archivedAt || "").localeCompare(String(left.archivedAt || "")))
      .slice(0, 3);

    return {
      currentGroups,
      archiveSummaries,
      hasCurrentGroups: currentGroups.length > 0
    };
  },

  async createGroup({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await runCreateStage("requireCurrentUser", () => requireCurrentUser(db, authContext));
    const repeatedAudit = await runCreateStage(
      "findCreateGroupAudit",
      () => findCreateGroupAudit(db, currentUser.userId, requestId)
    );

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const name = normalizeGroupName(payload.name);
    const groupType = payload.groupType === "nextMonth" ? "nextMonth" : payload.groupType === "currentMonth" ? "currentMonth" : "";
    if (!groupType) {
      throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field: "groupType" });
    }

    const now = new Date();
    const lifecycle = groupType === "nextMonth"
      ? getNextMonthLifecycle(now)
      : getCurrentMonthLifecycle(now);
    const status = groupType === "nextMonth"
      ? "upcoming"
      : resolveGroupStatusByLifecycle(lifecycle.lifecycleStartAt, lifecycle.lifecycleEndAt, now);
    const inviteCode = await runCreateStage("createUniqueInviteCode", () => createUniqueInviteCode(db));
    const nickname = resolveCreatorNickname(payload);

    const group = {
      name,
      inviteCode,
      status,
      monthKey: lifecycle.monthKey,
      lifecycleStartAt: lifecycle.lifecycleStartAt,
      lifecycleEndAt: lifecycle.lifecycleEndAt,
      activeMemberCount: 1,
      maxMembers: MAX_MEMBERS
    };
    const groupAddResult = await runCreateStage("createGroupRecord", () => db.collection("groups").add({
      data: {
        name,
        monthKey: lifecycle.monthKey,
        groupType,
        status,
        lifecycleStartAt: lifecycle.lifecycleStartAt,
        lifecycleEndAt: lifecycle.lifecycleEndAt,
        creatorUserId: currentUser.userId,
        creatorMembershipId: "",
        inviteCode,
        inviteStatus: "active",
        maxMembers: MAX_MEMBERS,
        activeMemberCount: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.userId,
        updatedBy: currentUser.userId
      }
    }));
    const groupId = groupAddResult._id;

    const membershipAddResult = await runCreateStage(
      "createCreatorMembership",
      () => db.collection("memberships").add({
      data: {
        groupId,
        userId: currentUser.userId,
        openid: authContext.openid,
        nickname,
        role: "creator",
        status: "active",
        activePeriodSeq: 1,
        activePeriods: [{
          seq: 1,
          startAt: now,
          endAt: null,
          startReason: "createGroup",
          endReason: null
        }],
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.userId,
        updatedBy: currentUser.userId
      }
      })
    );
    const membershipId = membershipAddResult._id;

    await runCreateStage(
      "bindCreatorMembership",
      () => db.collection("groups").doc(groupId).update({
        data: {
          creatorMembershipId: membershipId,
          updatedAt: now,
          updatedBy: currentUser.userId
        }
      })
    );

    const targetConfigId = await runCreateStage(
      "createTargetConfig",
      () => createUnsetTargetConfig(db, {
        groupId,
        membershipId,
        userId: currentUser.userId,
        monthKey: lifecycle.monthKey,
        now
      })
    );

    const resultData = toCreateGroupResult({
      groupId,
      membershipId,
      targetConfigId,
      group
    });

    await runCreateStage(
      "writeCreateAudit",
      () => writeAuditLog(db, {
        actionType: "GROUP_CREATE",
        actorUserId: currentUser.userId,
        actorMembershipId: membershipId,
        targetType: "group",
        targetId: groupId,
        groupId,
        requestId,
        traceId: traceId || "",
        result: "success",
        resultData,
        createdAt: now
      })
    );

    return resultData;
  },

  async getJoinPreview({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const inviteCode = normalizeInviteCode(payload.inviteCode);
    const group = await findGroupByInviteCode(db, inviteCode);

    assertGroupJoinable(group, { checkCapacity: false });
    await ensureGroupLifecycle(db, group);

    const membership = await findMembership(db, group._id, currentUser.userId);
    if (membership && membership.status === "removed") {
      throw new AppError(ErrorCodes.MEMBER_NOT_ACTIVE, "", { reason: "removed", groupId: group._id });
    }
    if (!membership || membership.status !== "active") {
      assertGroupJoinable(group);
    }

    const creatorMembership = await findOne(db.collection("memberships"), {
      groupId: group._id,
      role: "creator",
      status: "active"
    });

    return toJoinPreview({ ...group, creatorNickname: creatorMembership ? creatorMembership.nickname : "" }, membership);
  },

  async joinGroup({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findJoinAudit(db, currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const inviteCode = normalizeInviteCode(payload.inviteCode);
    const nickname = normalizeNickname(payload.nickname);
    const group = await findGroupByInviteCode(db, inviteCode);

    assertGroupJoinable(group, { checkCapacity: false });

    const now = new Date();
    await ensureGroupLifecycle(db, group, now);
    const existingMembership = await findMembership(db, group._id, currentUser.userId);

    if (existingMembership && existingMembership.status === "removed") {
      throw new AppError(ErrorCodes.MEMBER_NOT_ACTIVE, "", { reason: "removed", groupId: group._id });
    }

    if (existingMembership && existingMembership.status === "active") {
      const targetConfigId = await ensureTargetConfig(db, {
        groupId: group._id,
        membershipId: existingMembership._id,
        userId: currentUser.userId,
        monthKey: group.monthKey,
        now
      });

      return toJoinResult({
        group,
        membershipId: existingMembership._id,
        targetConfigId,
        activePeriodSeq: existingMembership.activePeriodSeq || 1,
        joinedType: "alreadyMember",
        alreadyMember: true
      });
    }

    assertGroupJoinable(group);

    let membershipId = "";
    let activePeriodSeq = 1;
    let actionType = "MEMBER_JOIN";

    if (existingMembership && existingMembership.status === "exited") {
      activePeriodSeq = (existingMembership.activePeriodSeq || 0) + 1;
      const activePeriods = Array.isArray(existingMembership.activePeriods)
        ? existingMembership.activePeriods.slice()
        : [];
      activePeriods.push({
        seq: activePeriodSeq,
        startAt: now,
        endAt: null,
        startReason: "rejoin",
        endReason: null
      });

      await db.collection("memberships").doc(existingMembership._id).update({
        data: {
          nickname,
          status: "active",
          activePeriodSeq,
          activePeriods,
          lastRejoinedAt: now,
          updatedAt: now,
          updatedBy: currentUser.userId
        }
      });
      membershipId = existingMembership._id;
      actionType = "MEMBER_REJOIN";
    } else {
      const membershipAddResult = await db.collection("memberships").add({
        data: {
          groupId: group._id,
          userId: currentUser.userId,
          openid: authContext.openid,
          nickname,
          role: "member",
          status: "active",
          activePeriodSeq,
          activePeriods: [{
            seq: activePeriodSeq,
            startAt: now,
            endAt: null,
            startReason: "join",
            endReason: null
          }],
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
          createdBy: currentUser.userId,
          updatedBy: currentUser.userId
        }
      });
      membershipId = membershipAddResult._id;
    }

    const nextActiveMemberCount = (group.activeMemberCount || 0) + 1;
    await db.collection("groups").doc(group._id).update({
      data: {
        activeMemberCount: nextActiveMemberCount,
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });
    group.activeMemberCount = nextActiveMemberCount;

    const targetConfigId = await ensureTargetConfig(db, {
      groupId: group._id,
      membershipId,
      userId: currentUser.userId,
      monthKey: group.monthKey,
      now
    });
    const resultData = toJoinResult({
      group,
      membershipId,
      targetConfigId,
      activePeriodSeq,
      joinedType: actionType === "MEMBER_REJOIN" ? "rejoin" : "join",
      alreadyMember: false
    });

    await writeAuditLog(db, {
      actionType,
      actorUserId: currentUser.userId,
      actorMembershipId: membershipId,
      targetType: "membership",
      targetId: membershipId,
      groupId: group._id,
      requestId,
      traceId: traceId || "",
      result: "success",
      resultData,
      createdAt: now
    });

    return resultData;
  },

  async getGroupDetail({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const group = await findGroupById(db, groupId);

    assertGroupReadable(group);
    await ensureGroupLifecycle(db, group);

    const currentMembership = await findMembership(db, groupId, currentUser.userId);
    assertActiveMembership(currentMembership);

    const activeMemberships = await findMany(db.collection("memberships"), {
      groupId,
      status: "active"
    });
    const targetConfigs = await findMany(db.collection("targetConfigs"), {
      groupId,
      monthKey: group.monthKey
    });
    const records = group.status === "active"
      ? await findMany(db.collection("checkinRecords"), {
        groupId,
        monthKey: group.monthKey
      })
      : [];
    const sortedMemberships = activeMemberships
      .sort((left, right) => {
        if (left.role === right.role) {
          return String(left.joinedAt || "").localeCompare(String(right.joinedAt || ""));
        }
        return left.role === "creator" ? -1 : 1;
      });
    const stats = calculateGroupStats({
      group,
      activeMemberships: sortedMemberships,
      targetConfigs,
      records
    });

    return {
      group: {
        groupId: group._id,
        name: group.name,
        status: group.status,
        monthKey: group.monthKey,
        lifecycleStartAt: group.lifecycleStartAt,
        lifecycleEndAt: group.lifecycleEndAt,
        activeMemberCount: group.activeMemberCount || stats.members.length,
        maxMembers: group.maxMembers || MAX_MEMBERS,
        currentUserRole: currentMembership.role,
        canManage: currentMembership.role === "creator",
        inviteCode: currentMembership.role === "creator" ? group.inviteCode : "",
        statsSummary: stats.groupSummary
      },
      currentMembership: {
        membershipId: currentMembership._id,
        role: currentMembership.role,
        nickname: currentMembership.nickname,
        activePeriodSeq: currentMembership.activePeriodSeq || 1
      },
      members: stats.members,
      statsSummary: stats.groupSummary,
      visibilityTips: {
        photos: true,
        remarks: true,
        targets: true,
        statistics: true
      }
    };
  },

  async getGroupManagement({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const group = await findGroupById(db, groupId);

    assertGroupReadable(group);
    await ensureGroupLifecycle(db, group);

    const currentMembership = await findMembership(db, groupId, currentUser.userId);
    assertCreatorMembership(currentMembership);

    const activeMemberships = await findMany(db.collection("memberships"), {
      groupId,
      status: "active"
    });
    const targetConfigs = await findMany(db.collection("targetConfigs"), {
      groupId,
      monthKey: group.monthKey
    });
    const targetByMembershipId = new Map(targetConfigs.map((targetConfig) => [targetConfig.membershipId, targetConfig]));
    const members = activeMemberships
      .sort((left, right) => {
        if (left.role === right.role) {
          return String(left.joinedAt || "").localeCompare(String(right.joinedAt || ""));
        }
        return left.role === "creator" ? -1 : 1;
      })
      .map((member) => toManagementMember(member, targetByMembershipId.get(member._id), group.creatorMembershipId));

    return {
      group: {
        groupId: group._id,
        name: group.name,
        status: group.status,
        monthKey: group.monthKey,
        lifecycleStartAt: group.lifecycleStartAt,
        lifecycleEndAt: group.lifecycleEndAt,
        activeMemberCount: group.activeMemberCount || members.length,
        maxMembers: group.maxMembers || MAX_MEMBERS,
        inviteCode: group.inviteCode,
        inviteStatus: group.inviteStatus || "active",
        creatorMembershipId: group.creatorMembershipId
      },
      currentMembership: {
        membershipId: currentMembership._id,
        role: currentMembership.role,
        nickname: currentMembership.nickname
      },
      shareInfo: {
        inviteCode: group.inviteCode,
        path: `/pages/group/join/index?inviteCode=${encodeURIComponent(group.inviteCode)}`,
        title: `${group.name}`
      },
      members,
      transferCandidates: members.filter((member) => member.canTransferCreator),
      removableMembers: members.filter((member) => member.canRemove)
    };
  },

  async updateGroupName({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "GROUP_UPDATE_NAME", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const groupId = normalizeId(payload.groupId, "groupId");
    const name = normalizeGroupName(payload.name);
    const group = await findGroupById(db, groupId);

    assertGroupReadable(group);

    const currentMembership = await findMembership(db, groupId, currentUser.userId);
    assertCreatorMembership(currentMembership);

    const now = new Date();
    const beforeName = group.name;
    await db.collection("groups").doc(groupId).update({
      data: {
        name,
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });

    const resultData = {
      groupId,
      name,
      updatedAt: now
    };

    await writeAuditLog(db, {
      actionType: "GROUP_UPDATE_NAME",
      actorUserId: currentUser.userId,
      actorMembershipId: currentMembership._id,
      targetType: "group",
      targetId: groupId,
      groupId,
      requestId,
      traceId: traceId || "",
      result: "success",
      before: { name: beforeName },
      after: { name },
      resultData,
      createdAt: now
    });

    return resultData;
  },

  async transferCreator({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "CREATOR_TRANSFER", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const groupId = normalizeId(payload.groupId, "groupId");
    const targetMembershipId = normalizeId(payload.targetMembershipId, "targetMembershipId");
    const group = await findGroupById(db, groupId);

    assertGroupReadable(group);

    const currentMembership = await findMembership(db, groupId, currentUser.userId);
    assertCreatorMembership(currentMembership);

    if (targetMembershipId === currentMembership._id) {
      throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field: "targetMembershipId" });
    }

    const targetMembership = await findOne(db.collection("memberships"), { _id: targetMembershipId });
    if (!targetMembership || targetMembership.groupId !== groupId || targetMembership.status !== "active") {
      throw new AppError(ErrorCodes.MEMBER_NOT_ACTIVE, "", { membershipId: targetMembershipId });
    }

    const now = new Date();
    await db.collection("memberships").doc(currentMembership._id).update({
      data: {
        role: "member",
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });
    await db.collection("memberships").doc(targetMembershipId).update({
      data: {
        role: "creator",
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });
    await db.collection("groups").doc(groupId).update({
      data: {
        creatorUserId: targetMembership.userId,
        creatorMembershipId: targetMembershipId,
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });

    const resultData = {
      groupId,
      oldCreatorMembershipId: currentMembership._id,
      newCreatorMembershipId: targetMembershipId,
      creatorUserId: targetMembership.userId,
      updatedAt: now
    };

    await writeAuditLog(db, {
      actionType: "CREATOR_TRANSFER",
      actorUserId: currentUser.userId,
      actorMembershipId: currentMembership._id,
      targetType: "membership",
      targetId: targetMembershipId,
      groupId,
      requestId,
      traceId: traceId || "",
      result: "success",
      resultData,
      createdAt: now
    });

    return resultData;
  },

  async exitGroup({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "MEMBER_EXIT", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const groupId = normalizeId(payload.groupId, "groupId");
    const group = await findGroupById(db, groupId);

    assertGroupReadable(group);

    const currentMembership = await findMembership(db, groupId, currentUser.userId);
    assertActiveMembership(currentMembership);

    if (currentMembership.role === "creator") {
      throw new AppError(ErrorCodes.MEMBER_CREATOR_TRANSFER_REQUIRED, "", { membershipId: currentMembership._id });
    }

    const now = new Date();
    const nextActiveMemberCount = decrementActiveMemberCount(group);
    await db.collection("memberships").doc(currentMembership._id).update({
      data: {
        status: "exited",
        activePeriods: closeActivePeriods(currentMembership.activePeriods, now, "exit"),
        exitedAt: now,
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });
    await db.collection("groups").doc(groupId).update({
      data: {
        activeMemberCount: nextActiveMemberCount,
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });

    const resultData = {
      groupId,
      membershipId: currentMembership._id,
      status: "exited",
      activeMemberCount: nextActiveMemberCount,
      updatedAt: now
    };

    await writeAuditLog(db, {
      actionType: "MEMBER_EXIT",
      actorUserId: currentUser.userId,
      actorMembershipId: currentMembership._id,
      targetType: "membership",
      targetId: currentMembership._id,
      groupId,
      requestId,
      traceId: traceId || "",
      result: "success",
      resultData,
      createdAt: now
    });

    return resultData;
  },

  async removeMember({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "MEMBER_REMOVE", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const groupId = normalizeId(payload.groupId, "groupId");
    const targetMembershipId = normalizeId(payload.targetMembershipId, "targetMembershipId");
    const group = await findGroupById(db, groupId);

    assertGroupReadable(group);

    const currentMembership = await findMembership(db, groupId, currentUser.userId);
    assertCreatorMembership(currentMembership);

    if (targetMembershipId === currentMembership._id) {
      throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field: "targetMembershipId" });
    }

    const targetMembership = await findOne(db.collection("memberships"), { _id: targetMembershipId });
    if (!targetMembership || targetMembership.groupId !== groupId || targetMembership.status !== "active") {
      throw new AppError(ErrorCodes.MEMBER_NOT_ACTIVE, "", { membershipId: targetMembershipId });
    }
    if (targetMembership.role === "creator") {
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", { membershipId: targetMembershipId });
    }

    const now = new Date();
    const nextActiveMemberCount = decrementActiveMemberCount(group);
    await db.collection("memberships").doc(targetMembershipId).update({
      data: {
        status: "removed",
        activePeriods: closeActivePeriods(targetMembership.activePeriods, now, "removed"),
        removedAt: now,
        removedBy: currentUser.userId,
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });
    await db.collection("groups").doc(groupId).update({
      data: {
        activeMemberCount: nextActiveMemberCount,
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });

    const resultData = {
      groupId,
      membershipId: targetMembershipId,
      status: "removed",
      activeMemberCount: nextActiveMemberCount,
      updatedAt: now
    };

    await writeAuditLog(db, {
      actionType: "MEMBER_REMOVE",
      actorUserId: currentUser.userId,
      actorMembershipId: currentMembership._id,
      targetType: "membership",
      targetId: targetMembershipId,
      groupId,
      requestId,
      traceId: traceId || "",
      result: "success",
      resultData,
      createdAt: now
    });

    return resultData;
  },

  async dissolveGroup({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "GROUP_DISSOLVE", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const groupId = normalizeId(payload.groupId, "groupId");
    const group = await findGroupById(db, groupId);

    assertGroupReadable(group);

    const currentMembership = await findMembership(db, groupId, currentUser.userId);
    assertCreatorMembership(currentMembership);

    const now = new Date();
    await db.collection("groups").doc(groupId).update({
      data: {
        status: "dissolved",
        inviteStatus: "disabled",
        dissolvedAt: now,
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });

    const resultData = {
      groupId,
      status: "dissolved",
      dissolvedAt: now
    };

    await writeAuditLog(db, {
      actionType: "GROUP_DISSOLVE",
      actorUserId: currentUser.userId,
      actorMembershipId: currentMembership._id,
      targetType: "group",
      targetId: groupId,
      groupId,
      requestId,
      traceId: traceId || "",
      result: "success",
      resultData,
      createdAt: now
    });

    return resultData;
  }
};
