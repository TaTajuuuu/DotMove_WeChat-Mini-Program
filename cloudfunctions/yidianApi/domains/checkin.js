const { createAuthContext, requireCurrentUser } = require("../common/auth");
const {
  addDaysToDateKey,
  formatDateKey,
  getDayBeforeYesterdayDateKey,
  getYesterdayDateKey,
  parseDateKeyStart
} = require("../common/date");
const { AppError, ErrorCodes } = require("../common/errors");
const {
  calculateMemberStats,
  getContentReviewStatus,
  isEligibleRecord,
  isRecordContextEligible
} = require("../common/stats");
const {
  assertTextContentSafe,
  submitPhotoReviews
} = require("../common/contentReview");

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

async function findCheckinRecord(db, checkinRecordId) {
  return findOne(db.collection("checkinRecords"), { _id: checkinRecordId });
}

async function refreshResultReviewStatus(db, resultData) {
  const recordId = resultData && resultData.checkinRecordId;
  if (!recordId) return resultData;
  const record = await findCheckinRecord(db, recordId);
  return {
    ...resultData,
    contentReviewStatus: getContentReviewStatus(record)
  };
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

async function resolveRecordPhotos(cloud, photos) {
  const sourcePhotos = Array.isArray(photos) ? photos : [];
  const fileIds = sourcePhotos
    .map((photo) => trimString(photo.fileId || photo.url))
    .filter((fileId) => fileId.startsWith("cloud://"));
  let tempUrlByFileId = new Map();

  if (fileIds.length > 0) {
    try {
      const result = await cloud.getTempFileURL({ fileList: fileIds });
      tempUrlByFileId = new Map((result.fileList || []).map((file) => [
        file.fileID,
        file.tempFileURL || ""
      ]));
    } catch (error) {
      tempUrlByFileId = new Map();
    }
  }

  return sourcePhotos.map((photo, index) => {
    const fileId = trimString(photo.fileId || photo.url);
    const directUrl = trimString(photo.url);
    return {
      fileId,
      url: tempUrlByFileId.get(fileId) || (directUrl.startsWith("http") ? directUrl : fileId),
      cloudPath: trimString(photo.cloudPath),
      name: trimString(photo.name),
      mimeType: trimString(photo.mimeType),
      sort: Number(photo.sort || index + 1),
      loadFailed: !tempUrlByFileId.get(fileId) && !directUrl && !fileId
    };
  }).sort((left, right) => left.sort - right.sort);
}

async function startContentReview({
  cloud,
  db,
  currentUser,
  recordId,
  revision,
  photos
}) {
  try {
    await submitPhotoReviews({
      cloud,
      db,
      openid: currentUser.openid,
      recordId,
      revision,
      photos
    });
    return "pending";
  } catch (error) {
    const now = new Date();
    await db.collection("checkinRecords").doc(recordId).update({
      data: {
        contentReviewStatus: "failed",
        contentReviewReason: "submitFailed",
        contentReviewCompletedAt: now,
        updatedAt: now
      }
    });
    console.error("[contentReview] failed to submit photo review", {
      recordId,
      revision,
      stage: "submitPhotoReviews",
      code: error && error.code,
      errMsg: trimString(error && (error.errMsg || error.message))
    });
    return "failed";
  }
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

function toContextResult(group, membership, targetConfig, limits) {
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
    remainingTodayCount: limits.remainingTodayCount,
    remainingSportDateCount: limits.remainingSportDateCount,
    remainingDailyMakeupCount: limits.remainingDailyMakeupCount
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
    const sportDate = trimString(payload.sportDate) || todayKey;
    const [todayCount, sportDateCount, dailyMakeupCount] = await Promise.all([
      countEffectiveRecords(db, groupId, membership._id, todayKey),
      sportDate === todayKey
        ? Promise.resolve(null)
        : countEffectiveRecords(db, groupId, membership._id, sportDate),
      countDailyMakeups(db, currentUser.userId, todayKey)
    ]);

    return toContextResult(group, membership, targetConfig, {
      remainingTodayCount: Math.max(5 - todayCount, 0),
      remainingSportDateCount: Math.max(5 - (sportDateCount === null ? todayCount : sportDateCount), 0),
      remainingDailyMakeupCount: Math.max(3 - dailyMakeupCount, 0)
    });
  },

  async createCheckin({ payload = {}, event = {}, cloud, context, traceId }) {
    const requestId = assertWriteRequestId(event);
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const repeatedAudit = await findActionAudit(db, "CHECKIN_CREATE", currentUser.userId, requestId);

    if (repeatedAudit && repeatedAudit.resultData) {
      return refreshResultReviewStatus(db, repeatedAudit.resultData);
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

    const metrics = normalizeMetrics(payload.metrics, targetConfig.selectedGoalTypes);
    const photos = normalizePhotos(payload.photos);
    const remark = normalizeRemark(payload.remark);
    await assertTextContentSafe(cloud, currentUser.openid, remark);
    const now = new Date();
    const contentRevision = 1;
    const resultData = await db.runTransaction(async (transaction) => {
      const transactionAudit = await findActionAudit(transaction, "CHECKIN_CREATE", currentUser.userId, requestId);
      if (transactionAudit && transactionAudit.resultData) {
        return transactionAudit.resultData;
      }

      const effectiveCount = await countEffectiveRecords(transaction, groupId, membership._id, sportDate);
      if (effectiveCount >= 5) {
        throw new AppError(ErrorCodes.CHECKIN_LIMIT_REACHED, "", { groupId, membershipId: membership._id, sportDate });
      }

      const addResult = await transaction.collection("checkinRecords").add({
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
           contentReviewStatus: "pending",
           contentRevision,
           contentReviewExpectedCount: photos.length,
           contentReviewTraceIds: [],
           contentReviewRequestedAt: null,
           contentReviewCompletedAt: null,
           contentReviewReason: "",
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
         contentReviewStatus: "pending",
         isMakeup: false
      };

      await writeAuditLog(transaction, {
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
    });

    resultData.contentReviewStatus = await startContentReview({
      cloud,
      db,
      currentUser,
      recordId: resultData.checkinRecordId,
      revision: contentRevision,
      photos
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
      return refreshResultReviewStatus(db, repeatedAudit.resultData);
    }

    if (repeatedAudit) {
      throw new AppError(ErrorCodes.COMMON_DUPLICATE_REQUEST, "", { requestId });
    }

    const groupId = normalizeId(payload.groupId, "groupId");
    const { group, membership, targetConfig } = await loadCheckinContext({ db, currentUser, groupId });
    const submitDate = formatDateKey();
    const sportDate = resolveMakeupSportDate(payload.sportDate, submitDate);
    const metrics = normalizeMetrics(payload.metrics, targetConfig.selectedGoalTypes);
    const photos = normalizePhotos(payload.photos);
    const remark = normalizeRemark(payload.remark);
    await assertTextContentSafe(cloud, currentUser.openid, remark);
    const now = new Date();
    const makeupForExitedPeriod = isSportDateInExitedGap(membership.activePeriods, sportDate, membership.activePeriodSeq || 1);
    const contentRevision = 1;
    const resultData = await db.runTransaction(async (transaction) => {
      const transactionAudit = await findActionAudit(transaction, "MAKEUP_CREATE", currentUser.userId, requestId);
      if (transactionAudit && transactionAudit.resultData) {
        return transactionAudit.resultData;
      }

      const dailyMakeupCount = await countDailyMakeups(transaction, currentUser.userId, submitDate);
      if (dailyMakeupCount >= 3) {
        throw new AppError(ErrorCodes.MAKEUP_DAILY_LIMIT_REACHED, "", { userId: currentUser.userId, submitDate });
      }

      const effectiveCount = await countEffectiveRecords(transaction, groupId, membership._id, sportDate);
      if (effectiveCount >= 5) {
        throw new AppError(ErrorCodes.CHECKIN_LIMIT_REACHED, "", { groupId, membershipId: membership._id, sportDate });
      }

      const addResult = await transaction.collection("checkinRecords").add({
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
           contentReviewStatus: "pending",
           contentRevision,
           contentReviewExpectedCount: photos.length,
           contentReviewTraceIds: [],
           contentReviewRequestedAt: null,
           contentReviewCompletedAt: null,
           contentReviewReason: "",
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
         contentReviewStatus: "pending",
         isMakeup: true,
        makeupForExitedPeriod
      };

      await writeAuditLog(transaction, {
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
    });

    resultData.contentReviewStatus = await startContentReview({
      cloud,
      db,
      currentUser,
      recordId: resultData.checkinRecordId,
      revision: contentRevision,
      photos
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
      return refreshResultReviewStatus(db, repeatedAudit.resultData);
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
    await assertTextContentSafe(cloud, currentUser.openid, remark);
    const now = new Date();
    const nextEditCount = (record.editCount || 0) + 1;
    const contentRevision = Number(record.contentRevision || 0) + 1;

    await db.collection("checkinRecords").doc(checkinRecordId).update({
      data: {
        status: "edited",
        contentReviewStatus: "pending",
        contentRevision,
        contentReviewExpectedCount: photos.length,
        contentReviewTraceIds: [],
        contentReviewRequestedAt: null,
        contentReviewCompletedAt: null,
        contentReviewReason: "",
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
      contentReviewStatus: "pending",
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

    resultData.contentReviewStatus = await startContentReview({
      cloud,
      db,
      currentUser,
      recordId: checkinRecordId,
      revision: contentRevision,
      photos
    });
    return resultData;
  },

  async getCheckinRecords({ payload = {}, cloud, context }) {
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

    return {
      records: records
        .filter((record) => isRecordContextEligible(record, membership, targetConfig, group))
        .sort((left, right) => String(right.sportDate || "").localeCompare(String(left.sportDate || "")))
        .map((record) => ({
          checkinRecordId: record._id,
          sportDate: record.sportDate,
          submitDate: record.submitDate,
          isMakeup: Boolean(record.isMakeup),
           status: record.status,
           contentReviewStatus: getContentReviewStatus(record),
          metrics: record.metrics || {},
          photos: record.photos || [],
          remark: record.remark || "",
          editCount: record.editCount || 0
        }))
    };
  },

  async getCheckinRecordDetail({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const checkinRecordId = normalizeId(payload.checkinRecordId, "checkinRecordId");
    const record = await findCheckinRecord(db, checkinRecordId);

    if (!record || !isEffectiveRecord(record)) {
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", { checkinRecordId });
    }

    const group = await findGroupById(db, record.groupId);
    assertActiveGroup(group);

    const currentMembership = await findMembership(db, record.groupId, currentUser.userId);
    assertActiveMembership(currentMembership);

    const recordMembership = await findMembershipById(db, record.membershipId);
    if (!recordMembership || recordMembership.groupId !== record.groupId || recordMembership.status !== "active") {
      throw new AppError(ErrorCodes.MEMBER_NOT_ACTIVE, "", { membershipId: record.membershipId });
    }

    const targetConfig = await findTargetConfig(db, record.groupId, record.membershipId, group.monthKey);
    const isOwner = record.userId === currentUser.userId;
    const contextEligible = isRecordContextEligible(record, recordMembership, targetConfig, group);
    if (!contextEligible || (!isOwner && !isEligibleRecord(record, recordMembership, targetConfig, group))) {
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", { checkinRecordId });
    }

    const photos = await resolveRecordPhotos(cloud, record.photos);
    return {
      group: {
        groupId: group._id,
        name: group.name,
        monthKey: group.monthKey
      },
      member: {
        membershipId: recordMembership._id,
        nickname: recordMembership.nickname,
        role: recordMembership.role
      },
      record: {
        checkinRecordId: record._id,
        sportDate: record.sportDate,
        submitDate: record.submitDate,
        isMakeup: Boolean(record.isMakeup),
         status: record.status,
         contentReviewStatus: getContentReviewStatus(record),
        metrics: record.metrics || {},
        photos,
        remark: record.remark || "",
        editCount: Number(record.editCount || 0),
         canEdit: isOwner && record.submitDate === formatDateKey()
      }
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
