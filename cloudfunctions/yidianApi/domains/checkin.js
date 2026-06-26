const { createAuthContext, requireCurrentUser } = require("../common/auth");
const {
  addDaysToDateKey,
  formatDateKey,
  getDayBeforeYesterdayDateKey,
  getYesterdayDateKey,
  parseDateKeyStart
} = require("../common/date");
const { AppError, ErrorCodes } = require("../common/errors");
const { calculateMemberStats, isEligibleRecord } = require("../common/stats");

const EFFECTIVE_RECORD_STATUSES = new Set(["valid", "edited"]);
const STATIC_IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp)$/i;

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
  const result = await collection.where(query).get();
  return result.data || [];
}

async function findGroupById(db, groupId) {
  return findOne(db.collection("groups"), { _id: groupId });
}

async function findMembership(db, groupId, userId) {
  return findOne(db.collection("memberships"), { groupId, userId });
}

async function findTargetConfig(db, groupId, membershipId, monthKey) {
  return findOne(db.collection("targetConfigs"), { groupId, membershipId, monthKey });
}

async function findCheckinRecord(db, checkinRecordId) {
  return findOne(db.collection("checkinRecords"), { _id: checkinRecordId });
}

async function findActionAudit(db, actionType, actorUserId, requestId) {
  return findOne(db.collection("auditLogs"), {
    actionType,
    actorUserId,
    requestId,
    result: "success"
  });
}

function assertActiveGroup(group) {
  if (!group) {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", {});
  }
  if (group.status === "upcoming") {
    throw new AppError(ErrorCodes.GROUP_NOT_STARTED, "", { groupId: group._id });
  }
  if (group.status === "archived") {
    throw new AppError(ErrorCodes.GROUP_ARCHIVED, "", { groupId: group._id });
  }
  if (group.status === "dissolved") {
    throw new AppError(ErrorCodes.GROUP_DISSOLVED, "", {});
  }
  if (group.status !== "active") {
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

function assertLockedTarget(targetConfig) {
  if (!targetConfig || targetConfig.status !== "locked" || !Array.isArray(targetConfig.selectedGoalTypes) || targetConfig.selectedGoalTypes.length === 0) {
    throw new AppError(ErrorCodes.TARGET_REQUIRED, "", {
      targetConfigId: targetConfig ? targetConfig._id : ""
    });
  }
}

function normalizePositiveMetric(value, field) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new AppError(ErrorCodes.CHECKIN_INVALID_METRICS, "", { field });
  }
  return Math.round(numberValue * 100) / 100;
}

function requireBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new AppError(ErrorCodes.CHECKIN_INVALID_METRICS, "", { field });
  }
  return value;
}

function requireMetricForGoal(normalized, field, goalType) {
  if (!Object.prototype.hasOwnProperty.call(normalized, field)) {
    throw new AppError(ErrorCodes.CHECKIN_INVALID_METRICS, "", { field: `metrics.${field}`, goalType });
  }
}

function normalizeMetrics(metrics = {}, selectedGoalTypes = []) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    throw new AppError(ErrorCodes.CHECKIN_INVALID_METRICS, "", { field: "metrics" });
  }

  const normalized = {};

  if (metrics.calories !== undefined) {
    normalized.calories = normalizePositiveMetric(metrics.calories, "metrics.calories");
  }

  if (metrics.durationMinutes !== undefined) {
    normalized.durationMinutes = normalizePositiveMetric(metrics.durationMinutes, "metrics.durationMinutes");
  }

  if (metrics.runningDistanceKm !== undefined) {
    normalized.runningDistanceKm = normalizePositiveMetric(metrics.runningDistanceKm, "metrics.runningDistanceKm");
  }

  if (metrics.cyclingDistanceKm !== undefined) {
    normalized.cyclingDistanceKm = normalizePositiveMetric(metrics.cyclingDistanceKm, "metrics.cyclingDistanceKm");
  }

  if (metrics.ringClosed !== undefined) {
    normalized.ringClosed = requireBoolean(metrics.ringClosed, "metrics.ringClosed");
  }

  const selected = new Set(Array.isArray(selectedGoalTypes) ? selectedGoalTypes : []);

  if (selected.has("calorieTotal") || selected.has("exerciseDays") || selected.has("exerciseTimes")) {
    requireMetricForGoal(normalized, "calories", "calorieRelated");
  }
  if (selected.has("durationTotal")) {
    requireMetricForGoal(normalized, "durationMinutes", "durationTotal");
  }
  if (selected.has("runningDistance")) {
    requireMetricForGoal(normalized, "runningDistanceKm", "runningDistance");
  }
  if (selected.has("cyclingDistance")) {
    requireMetricForGoal(normalized, "cyclingDistanceKm", "cyclingDistance");
  }
  if (selected.has("ringClosedDays")) {
    if (!Object.prototype.hasOwnProperty.call(normalized, "ringClosed")) {
      throw new AppError(ErrorCodes.CHECKIN_INVALID_METRICS, "", { field: "metrics.ringClosed", goalType: "ringClosedDays" });
    }
  }

  return normalized;
}

function normalizePhotos(photos) {
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > 3) {
    throw new AppError(ErrorCodes.PHOTO_COUNT_INVALID, "", { field: "photos" });
  }

  return photos.map((photo, index) => {
    if (!photo || typeof photo !== "object" || Array.isArray(photo)) {
      throw new AppError(ErrorCodes.PHOTO_TYPE_INVALID, "", { index });
    }

    const fileId = trimString(photo.fileId);
    const cloudPath = trimString(photo.cloudPath);
    const url = trimString(photo.url);
    const name = trimString(photo.name || cloudPath || fileId || url);
    const mimeType = trimString(photo.mimeType || photo.contentType);

    if (!fileId && !cloudPath && !url) {
      throw new AppError(ErrorCodes.PHOTO_UPLOAD_FAILED, "", { index });
    }

    if (mimeType && !/^image\/(jpeg|png|webp)$/i.test(mimeType)) {
      throw new AppError(ErrorCodes.PHOTO_TYPE_INVALID, "", { index });
    }

    if (!mimeType && name && !STATIC_IMAGE_EXT_RE.test(name)) {
      throw new AppError(ErrorCodes.PHOTO_TYPE_INVALID, "", { index });
    }

    return {
      fileId,
      cloudPath,
      url,
      name,
      mimeType,
      sort: index + 1
    };
  });
}

function normalizeRemark(value) {
  const remark = typeof value === "string" ? value.trim() : "";
  if (remark.length > 100) {
    throw new AppError(ErrorCodes.REMARK_TOO_LONG, "", { field: "remark" });
  }
  return remark;
}

function isEffectiveRecord(record) {
  return EFFECTIVE_RECORD_STATUSES.has(record.status);
}

async function countEffectiveRecords(db, groupId, membershipId, sportDate) {
  const records = await findMany(db.collection("checkinRecords"), {
    groupId,
    membershipId,
    sportDate
  });
  return records.filter(isEffectiveRecord).length;
}

async function countDailyMakeups(db, userId, submitDate) {
  const records = await findMany(db.collection("checkinRecords"), {
    userId,
    submitDate,
    isMakeup: true
  });
  return records.filter(isEffectiveRecord).length;
}

function resolveMakeupSportDate(value, submitDate) {
  const sportDate = trimString(value);
  if (!sportDate) {
    throw new AppError(ErrorCodes.MAKEUP_DATE_OUT_OF_RANGE, "", { field: "sportDate" });
  }
  if (sportDate === submitDate) {
    throw new AppError(ErrorCodes.MAKEUP_USE_CHECKIN_TODAY, "", { sportDate });
  }
  if (sportDate !== getYesterdayDateKey(submitDate) && sportDate !== getDayBeforeYesterdayDateKey(submitDate)) {
    throw new AppError(ErrorCodes.MAKEUP_DATE_OUT_OF_RANGE, "", { sportDate });
  }
  return sportDate;
}

function isSportDateInExitedGap(activePeriods, sportDate, activePeriodSeq) {
  const periods = Array.isArray(activePeriods)
    ? activePeriods.slice().sort((left, right) => (left.seq || 0) - (right.seq || 0))
    : [];
  const currentPeriod = periods.find((period) => period.seq === activePeriodSeq && !period.endAt) ||
    periods.find((period) => !period.endAt);

  if (!currentPeriod || !currentPeriod.startAt) {
    return false;
  }

  const currentStart = new Date(currentPeriod.startAt).getTime();
  const sportStart = parseDateKeyStart(sportDate).getTime();
  const sportEnd = parseDateKeyStart(addDaysToDateKey(sportDate, 1)).getTime() - 1;

  if (sportEnd >= currentStart) {
    return false;
  }

  const previousPeriod = periods
    .filter((period) => period.endAt && new Date(period.endAt).getTime() <= sportEnd)
    .pop();

  return Boolean(previousPeriod && new Date(previousPeriod.endAt).getTime() <= sportEnd && sportStart < currentStart);
}

async function loadCheckinContext({ db, currentUser, groupId }) {
  const group = await findGroupById(db, groupId);
  assertActiveGroup(group);

  const membership = await findMembership(db, groupId, currentUser.userId);
  assertActiveMembership(membership);

  const targetConfig = await findTargetConfig(db, groupId, membership._id, group.monthKey);
  assertLockedTarget(targetConfig);

  return { group, membership, targetConfig };
}

async function writeAuditLog(db, data) {
  await db.collection("auditLogs").add({ data });
}

function toContextResult(group, membership, targetConfig, remainingTodayCount) {
  return {
    group: {
      groupId: group._id,
      name: group.name,
      status: group.status,
      monthKey: group.monthKey
    },
    membership: {
      membershipId: membership._id,
      activePeriodSeq: membership.activePeriodSeq || 1,
      role: membership.role,
      nickname: membership.nickname
    },
    targetConfig: {
      targetConfigId: targetConfig._id,
      selectedGoalTypes: targetConfig.selectedGoalTypes,
      goals: targetConfig.goals,
      status: targetConfig.status
    },
    remainingTodayCount
  };
}

module.exports = {
  async getCheckinContext({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const { group, membership, targetConfig } = await loadCheckinContext({ db, currentUser, groupId });
    const todayKey = formatDateKey();
    const effectiveCount = await countEffectiveRecords(db, groupId, membership._id, todayKey);

    return toContextResult(group, membership, targetConfig, Math.max(5 - effectiveCount, 0));
  },

  async createCheckin({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "CHECKIN_CREATE", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const groupId = normalizeId(payload.groupId, "groupId");
    const { group, membership, targetConfig } = await loadCheckinContext({ db, currentUser, groupId });
    const submitDate = formatDateKey();
    const sportDate = trimString(payload.sportDate) || submitDate;

    if (sportDate !== submitDate) {
      throw new AppError(ErrorCodes.CHECKIN_INVALID_METRICS, "", { field: "sportDate" });
    }

    const effectiveCount = await countEffectiveRecords(db, groupId, membership._id, sportDate);
    if (effectiveCount >= 5) {
      throw new AppError(ErrorCodes.CHECKIN_LIMIT_REACHED, "", { groupId, membershipId: membership._id, sportDate });
    }

    const metrics = normalizeMetrics(payload.metrics, targetConfig.selectedGoalTypes);
    const photos = normalizePhotos(payload.photos);
    const remark = normalizeRemark(payload.remark);
    const now = new Date();
    const addResult = await db.collection("checkinRecords").add({
      data: {
        groupId,
        membershipId: membership._id,
        userId: currentUser.userId,
        monthKey: group.monthKey,
        sportDate,
        submitDate,
        submitAt: now,
        isMakeup: false,
        makeupForExitedPeriod: false,
        membershipActivePeriodSeq: membership.activePeriodSeq || 1,
        status: "valid",
        metrics,
        photos,
        remark,
        editCount: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.userId,
        updatedBy: currentUser.userId
      }
    });

    const resultData = {
      checkinRecordId: addResult._id,
      groupId,
      membershipId: membership._id,
      sportDate,
      submitDate,
      status: "valid",
      isMakeup: false
    };

    await writeAuditLog(db, {
      actionType: "CHECKIN_CREATE",
      actorUserId: currentUser.userId,
      actorMembershipId: membership._id,
      targetType: "checkinRecord",
      targetId: addResult._id,
      groupId,
      requestId,
      traceId: traceId || "",
      result: "success",
      resultData,
      createdAt: now
    });

    return resultData;
  },

  async createMakeup({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "MAKEUP_CREATE", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const groupId = normalizeId(payload.groupId, "groupId");
    const { group, membership, targetConfig } = await loadCheckinContext({ db, currentUser, groupId });
    const submitDate = formatDateKey();
    const sportDate = resolveMakeupSportDate(payload.sportDate, submitDate);
    const dailyMakeupCount = await countDailyMakeups(db, currentUser.userId, submitDate);

    if (dailyMakeupCount >= 3) {
      throw new AppError(ErrorCodes.MAKEUP_DAILY_LIMIT_REACHED, "", { userId: currentUser.userId, submitDate });
    }

    const effectiveCount = await countEffectiveRecords(db, groupId, membership._id, sportDate);
    if (effectiveCount >= 5) {
      throw new AppError(ErrorCodes.CHECKIN_LIMIT_REACHED, "", { groupId, membershipId: membership._id, sportDate });
    }

    const metrics = normalizeMetrics(payload.metrics, targetConfig.selectedGoalTypes);
    const photos = normalizePhotos(payload.photos);
    const remark = normalizeRemark(payload.remark);
    const now = new Date();
    const makeupForExitedPeriod = isSportDateInExitedGap(membership.activePeriods, sportDate, membership.activePeriodSeq || 1);
    const addResult = await db.collection("checkinRecords").add({
      data: {
        groupId,
        membershipId: membership._id,
        userId: currentUser.userId,
        monthKey: group.monthKey,
        sportDate,
        submitDate,
        submitAt: now,
        isMakeup: true,
        makeupForExitedPeriod,
        membershipActivePeriodSeq: membership.activePeriodSeq || 1,
        status: "valid",
        metrics,
        photos,
        remark,
        editCount: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.userId,
        updatedBy: currentUser.userId
      }
    });

    const resultData = {
      checkinRecordId: addResult._id,
      groupId,
      membershipId: membership._id,
      sportDate,
      submitDate,
      status: "valid",
      isMakeup: true,
      makeupForExitedPeriod
    };

    await writeAuditLog(db, {
      actionType: "MAKEUP_CREATE",
      actorUserId: currentUser.userId,
      actorMembershipId: membership._id,
      targetType: "checkinRecord",
      targetId: addResult._id,
      groupId,
      requestId,
      traceId: traceId || "",
      result: "success",
      resultData,
      createdAt: now
    });

    return resultData;
  },

  async updateCheckinRecord({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "CHECKIN_EDIT", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return repeatedAudit.resultData;
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const checkinRecordId = normalizeId(payload.checkinRecordId, "checkinRecordId");
    const record = await findCheckinRecord(db, checkinRecordId);

    if (!record || record.userId !== currentUser.userId) {
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", { checkinRecordId });
    }

    if (!isEffectiveRecord(record)) {
      throw new AppError(ErrorCodes.CHECKIN_INVALID_METRICS, "", { checkinRecordId });
    }

    const { group, membership, targetConfig } = await loadCheckinContext({ db, currentUser, groupId: record.groupId });
    if (membership._id !== record.membershipId) {
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", { checkinRecordId });
    }

    const todayKey = formatDateKey();
    if (record.submitDate !== todayKey) {
      throw new AppError(ErrorCodes.CHECKIN_EDIT_EXPIRED, "", {
        checkinRecordId,
        submitDate: record.submitDate
      });
    }

    const metrics = normalizeMetrics(payload.metrics, targetConfig.selectedGoalTypes);
    const photos = normalizePhotos(payload.photos);
    const remark = normalizeRemark(payload.remark);
    const now = new Date();
    const nextEditCount = (record.editCount || 0) + 1;

    await db.collection("checkinRecords").doc(checkinRecordId).update({
      data: {
        status: "edited",
        metrics,
        photos,
        remark,
        editCount: nextEditCount,
        lastEditedAt: now,
        updatedAt: now,
        updatedBy: currentUser.userId
      }
    });

    const resultData = {
      checkinRecordId,
      groupId: group._id,
      membershipId: membership._id,
      sportDate: record.sportDate,
      submitDate: record.submitDate,
      status: "edited",
      editCount: nextEditCount,
      isMakeup: Boolean(record.isMakeup)
    };

    await writeAuditLog(db, {
      actionType: "CHECKIN_EDIT",
      actorUserId: currentUser.userId,
      actorMembershipId: membership._id,
      targetType: "checkinRecord",
      targetId: checkinRecordId,
      groupId: group._id,
      requestId,
      traceId: traceId || "",
      result: "success",
      resultData,
      createdAt: now
    });

    return resultData;
  },

  async getCheckinRecords({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const { group, membership } = await loadCheckinContext({ db, currentUser, groupId });
    const records = await findMany(db.collection("checkinRecords"), {
      groupId,
      membershipId: membership._id,
      monthKey: group.monthKey
    });

    return {
      records: records
        .filter(isEffectiveRecord)
        .sort((left, right) => String(right.sportDate || "").localeCompare(String(left.sportDate || "")))
        .map((record) => ({
          checkinRecordId: record._id,
          sportDate: record.sportDate,
          submitDate: record.submitDate,
          isMakeup: Boolean(record.isMakeup),
          status: record.status,
          metrics: record.metrics || {},
          photos: record.photos || [],
          remark: record.remark || "",
          editCount: record.editCount || 0
        }))
    };
  },

  async getMyStats({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const { group, membership, targetConfig } = await loadCheckinContext({ db, currentUser, groupId });

    const records = await findMany(db.collection("checkinRecords"), {
      groupId,
      membershipId: membership._id,
      monthKey: group.monthKey
    });

    const stats = calculateMemberStats({
      group,
      membership,
      targetConfig,
      records: records.filter((r) => EFFECTIVE_RECORD_STATUSES.has(r.status))
    });

    return { stats };
  }
};
