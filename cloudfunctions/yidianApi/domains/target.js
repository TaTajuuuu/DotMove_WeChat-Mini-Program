const { createAuthContext, requireCurrentUser } = require("../common/auth");
const { AppError, ErrorCodes } = require("../common/errors");
const { calculateMemberStats, isEligibleRecord } = require("../common/stats");
const { ensureGroupLifecycle } = require("../common/groupLifecycle");

const SUPPORTED_GOAL_TYPES = [
  "calorieTotal",
  "durationTotal",
  "exerciseDays",
  "exerciseTimes",
  "runningDistance",
  "cyclingDistance",
  "ringClosedDays"
];

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value, field) {
  const id = trimString(value);
  if (!id) {
    throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field });
  }
  return id;
}

function assertWriteRequestId(event) {
  return normalizeId(event && event.requestId, "requestId");
}

async function findOne(collection, query) {
  const result = await collection.where(query).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function findMany(collection, query) {
  const rows = [];
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const result = await collection.where(query).skip(offset).limit(pageSize).get();
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
  }

  return rows;
}

async function findGroupById(db, groupId) {
  return findOne(db.collection("groups"), { _id: groupId });
}

async function findMembership(db, groupId, userId) {
  return findOne(db.collection("memberships"), { groupId, userId });
}

async function findMembershipById(db, membershipId) {
  return findOne(db.collection("memberships"), { _id: membershipId });
}

async function findTargetConfig(db, groupId, membershipId, monthKey) {
  return findOne(db.collection("targetConfigs"), { groupId, membershipId, monthKey });
}

async function findActionAudit(db, actionType, actorUserId, requestId) {
  return findOne(db.collection("auditLogs"), {
    actionType,
    actorUserId,
    requestId,
    result: "success"
  });
}

function assertEditableGroup(group) {
  if (!group) {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", {});
  }
  if (group.status === "archived") {
    throw new AppError(ErrorCodes.GROUP_ARCHIVED, "", { groupId: group._id });
  }
  if (group.status === "dissolved") {
    throw new AppError(ErrorCodes.GROUP_DISSOLVED, "", {});
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

function normalizeNumber(value, field) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new AppError(ErrorCodes.TARGET_INVALID_VALUE, "", { field });
  }
  return Math.round(numberValue * 100) / 100;
}

function normalizeNonNegativeNumber(value, field) {
  // 空值默认为 0
  if (value === "" || value === null || value === undefined) {
    return 0;
  }
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new AppError(ErrorCodes.TARGET_INVALID_COIN, "", { field });
  }
  return Math.round(numberValue * 100) / 100;
}

function normalizePositiveInteger(value, field) {
  const numberValue = normalizeNumber(value, field);
  if (!Number.isInteger(numberValue)) {
    throw new AppError(ErrorCodes.TARGET_INVALID_VALUE, "", { field });
  }
  return numberValue;
}

function normalizeSelectedGoalTypes(value, allowEmpty) {
  if (!Array.isArray(value)) {
    throw new AppError(ErrorCodes.TARGET_INVALID_VALUE, "", { field: "selectedGoalTypes" });
  }

  if (!allowEmpty && value.length === 0) {
    throw new AppError(ErrorCodes.TARGET_INVALID_VALUE, "", { field: "selectedGoalTypes" });
  }

  const seen = new Set();
  for (const goalType of value) {
    if (!SUPPORTED_GOAL_TYPES.includes(goalType)) {
      throw new AppError(ErrorCodes.TARGET_INVALID_VALUE, "", { field: "selectedGoalTypes", goalType });
    }
    if (seen.has(goalType)) {
      throw new AppError(ErrorCodes.TARGET_INVALID_VALUE, "", { field: "selectedGoalTypes", reason: "duplicate", goalType });
    }
    seen.add(goalType);
  }

  return value.slice();
}

function requireGoalObject(goals, goalType) {
  const goal = goals && goals[goalType];
  if (!goal || typeof goal !== "object" || Array.isArray(goal)) {
    throw new AppError(ErrorCodes.TARGET_INVALID_VALUE, "", { field: `goals.${goalType}` });
  }
  return goal;
}

function normalizeGoals(selectedGoalTypes, goals) {
  const normalized = {};

  for (const goalType of selectedGoalTypes) {
    const goal = requireGoalObject(goals, goalType);

    if (goalType === "calorieTotal") {
      normalized.calorieTotal = {
        targetKcal: normalizeNumber(goal.targetKcal, "goals.calorieTotal.targetKcal")
      };
    }

    if (goalType === "durationTotal") {
      const targetMinutes = goal.targetMinutes !== undefined
        ? normalizeNumber(goal.targetMinutes, "goals.durationTotal.targetMinutes")
        : normalizeNumber(goal.targetHours, "goals.durationTotal.targetHours") * 60;
      normalized.durationTotal = {
        targetMinutes: Math.round(targetMinutes * 100) / 100
      };
    }

    if (goalType === "exerciseDays") {
      normalized.exerciseDays = {
        targetDays: normalizePositiveInteger(goal.targetDays, "goals.exerciseDays.targetDays"),
        minKcalPerDay: normalizeNumber(goal.minKcalPerDay, "goals.exerciseDays.minKcalPerDay")
      };
    }

    if (goalType === "exerciseTimes") {
      normalized.exerciseTimes = {
        targetTimes: normalizePositiveInteger(goal.targetTimes, "goals.exerciseTimes.targetTimes"),
        minKcalPerTime: normalizeNumber(goal.minKcalPerTime, "goals.exerciseTimes.minKcalPerTime")
      };
    }

    if (goalType === "runningDistance") {
      normalized.runningDistance = {
        targetKm: normalizeNumber(goal.targetKm, "goals.runningDistance.targetKm")
      };
    }

    if (goalType === "cyclingDistance") {
      normalized.cyclingDistance = {
        targetKm: normalizeNumber(goal.targetKm, "goals.cyclingDistance.targetKm")
      };
    }

    if (goalType === "ringClosedDays") {
      normalized.ringClosedDays = {
        targetDays: normalizePositiveInteger(goal.targetDays, "goals.ringClosedDays.targetDays")
      };
    }
  }

  return normalized;
}

function toTargetConfigResult(group, membership, targetConfig) {
  return {
    group: {
      groupId: group._id,
      name: group.name,
      status: group.status,
      monthKey: group.monthKey
    },
    membership: {
      membershipId: membership._id,
      role: membership.role,
      nickname: membership.nickname,
      activePeriodSeq: membership.activePeriodSeq || 1
    },
    targetConfig: {
      targetConfigId: targetConfig ? targetConfig._id : "",
      status: targetConfig ? targetConfig.status : "unset",
      coinValue: targetConfig ? Number(targetConfig.coinValue || 0) : 0,
      selectedGoalTypes: targetConfig && Array.isArray(targetConfig.selectedGoalTypes) ? targetConfig.selectedGoalTypes : [],
      goals: targetConfig ? targetConfig.goals || {} : {},
      savedAt: targetConfig ? targetConfig.savedAt || null : null,
      lockedAt: targetConfig ? targetConfig.lockedAt || null : null
    },
    canEdit: group.status === "upcoming" || (group.status === "active" && (!targetConfig || targetConfig.status === "unset"))
  };
}

async function writeAuditLog(db, data) {
  await db.collection("auditLogs").add({ data });
}

function buildVisibleRecordSummaries(records, membership, targetConfig, group) {
  return records
    .filter((record) => isEligibleRecord(record, membership, targetConfig, group))
    .sort((left, right) => {
      const dateCompare = String(right.sportDate || "").localeCompare(String(left.sportDate || ""));
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return String(right.submitAt || right.createdAt || "").localeCompare(String(left.submitAt || left.createdAt || ""));
    })
    .map((record) => ({
      checkinRecordId: record._id,
      date: record.sportDate,
      submitDate: record.submitDate,
      isMakeup: Boolean(record.isMakeup),
      status: record.status,
      calorie: Number((record.metrics && record.metrics.calories) || 0),
      duration: Number((record.metrics && record.metrics.durationMinutes) || 0),
      tripleRing: Boolean(record.metrics && record.metrics.ringClosed),
      photoCount: Array.isArray(record.photos) ? record.photos.length : 0,
      hasRemark: Boolean(trimString(record.remark))
    }));
}

module.exports = {
  async getTargetConfig({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const group = await findGroupById(db, groupId);

    assertEditableGroup(group);
    await ensureGroupLifecycle(db, group);

    const membership = await findMembership(db, groupId, currentUser.userId);
    assertActiveMembership(membership);

    const targetConfig = await findTargetConfig(db, groupId, membership._id, group.monthKey);
    return toTargetConfigResult(group, membership, targetConfig);
  },

  async saveTargetConfig({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "TARGET_SAVE", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const groupId = normalizeId(payload.groupId, "groupId");
    const group = await findGroupById(db, groupId);

    assertEditableGroup(group);
    await ensureGroupLifecycle(db, group);

    const membership = await findMembership(db, groupId, currentUser.userId);
    assertActiveMembership(membership);

    let targetConfig = await findTargetConfig(db, groupId, membership._id, group.monthKey);
    const allowEmpty = group.status === "upcoming";
    const selectedGoalTypes = normalizeSelectedGoalTypes(payload.selectedGoalTypes, allowEmpty);
    const goals = normalizeGoals(selectedGoalTypes, payload.goals || {});
    const coinValue = normalizeNonNegativeNumber(payload.coinValue, "coinValue");

    if (group.status === "active" && (!targetConfig || targetConfig.status !== "unset")) {
      throw new AppError(ErrorCodes.TARGET_LOCKED, "", {
        targetConfigId: targetConfig ? targetConfig._id : ""
      });
    }

    if (targetConfig && targetConfig.status === "locked") {
      throw new AppError(ErrorCodes.TARGET_LOCKED, "", { targetConfigId: targetConfig._id });
    }

    const now = new Date();
    const nextStatus = selectedGoalTypes.length === 0
      ? "unset"
      : group.status === "active" ? "locked" : "set";
    const updateData = {
      status: nextStatus,
      coinValue,
      selectedGoalTypes,
      goals,
      savedAt: selectedGoalTypes.length > 0 ? now : null,
      lockedAt: nextStatus === "locked" ? now : null,
      updatedAt: now,
      updatedBy: currentUser.userId
    };

    if (!targetConfig) {
      const addResult = await db.collection("targetConfigs").add({
        data: {
          groupId,
          membershipId: membership._id,
          userId: currentUser.userId,
          monthKey: group.monthKey,
          createdAt: now,
          createdBy: currentUser.userId,
          ...updateData
        }
      });
      targetConfig = {
        _id: addResult._id,
        groupId,
        membershipId: membership._id,
        userId: currentUser.userId,
        monthKey: group.monthKey,
        createdAt: now,
        createdBy: currentUser.userId,
        ...updateData
      };
    } else {
      await db.collection("targetConfigs").doc(targetConfig._id).update({
        data: updateData
      });
      targetConfig = {
        ...targetConfig,
        ...updateData
      };
    }

    const resultData = {
      targetConfigId: targetConfig._id,
      groupId,
      membershipId: membership._id,
      status: targetConfig.status,
      coinValue: targetConfig.coinValue,
      selectedGoalTypes: targetConfig.selectedGoalTypes,
      goals: targetConfig.goals,
      savedAt: targetConfig.savedAt,
      lockedAt: targetConfig.lockedAt
    };

    await writeAuditLog(db, {
      actionType: "TARGET_SAVE",
      actorUserId: currentUser.userId,
      actorMembershipId: membership._id,
      targetType: "targetConfig",
      targetId: targetConfig._id,
      groupId,
      requestId,
      traceId: traceId || "",
      result: "success",
      resultData,
      createdAt: now
    });

    return resultData;
  },

  async getMyTargetDetail({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const group = await findGroupById(db, groupId);

    assertEditableGroup(group);
    await ensureGroupLifecycle(db, group);

    const membership = await findMembership(db, groupId, currentUser.userId);
    assertActiveMembership(membership);

    const targetConfig = await findTargetConfig(db, groupId, membership._id, group.monthKey);
    const records = group.status === "active"
      ? await findMany(db.collection("checkinRecords"), { groupId, monthKey: group.monthKey })
      : [];
    const calendarSportDates = Array.from(new Set(records
      .filter((record) => isEligibleRecord(record, membership, targetConfig, group))
      .map((record) => record.sportDate)
      .filter(Boolean)))
      .sort();

    const memberStats = calculateMemberStats({ group, membership, targetConfig, records });
    memberStats.recentRecords = buildVisibleRecordSummaries(records, membership, targetConfig, group);

    return {
      group: {
        groupId: group._id,
        name: group.name,
        status: group.status,
        monthKey: group.monthKey
      },
      memberStats,
      calendar: {
        monthKey: group.monthKey,
        sportDates: calendarSportDates
      }
    };
  },

  async getMemberTargetDetail({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const membershipId = normalizeId(payload.membershipId, "membershipId");
    const group = await findGroupById(db, groupId);

    assertEditableGroup(group);
    await ensureGroupLifecycle(db, group);

    const currentMembership = await findMembership(db, groupId, currentUser.userId);
    assertActiveMembership(currentMembership);

    const membership = await findMembershipById(db, membershipId);
    if (!membership || membership.groupId !== groupId || membership.status !== "active") {
      throw new AppError(ErrorCodes.MEMBER_NOT_ACTIVE, "", { membershipId });
    }

    const targetConfig = await findTargetConfig(db, groupId, membership._id, group.monthKey);
    const records = group.status === "active"
      ? await findMany(db.collection("checkinRecords"), { groupId, monthKey: group.monthKey })
      : [];
    const memberStats = calculateMemberStats({ group, membership, targetConfig, records });
    memberStats.recentRecords = buildVisibleRecordSummaries(records, membership, targetConfig, group);

    return {
      group: {
        groupId: group._id,
        name: group.name,
        status: group.status,
        monthKey: group.monthKey
      },
      currentMembership: {
        membershipId: currentMembership._id,
        role: currentMembership.role
      },
      memberStats
    };
  }
};
