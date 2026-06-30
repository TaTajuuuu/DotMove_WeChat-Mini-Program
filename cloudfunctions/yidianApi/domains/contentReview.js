const { getSuggest } = require("../common/contentReview");
const { AppError, ErrorCodes } = require("../common/errors");

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function findOne(collection, query) {
  const result = await collection.where(query).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function findMany(collection, query) {
  const result = await collection.where(query).limit(100).get();
  return result.data || [];
}

function requireCallbackSecret(payload) {
  const expected = trimString(process.env.CONTENT_REVIEW_CALLBACK_SECRET);
  if (!expected || trimString(payload.callbackSecret) !== expected) {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", {});
  }
}

function normalizeCallback(payload) {
  const body = payload.callback || payload;
  return {
    traceId: trimString(body.traceId || body.trace_id),
    suggest: getSuggest(body),
    raw: body
  };
}

async function rejectRecord({ cloud, db, record, suggest }) {
  const photos = Array.isArray(record.photos) ? record.photos : [];
  const fileList = photos
    .map((photo) => trimString(photo.fileId || photo.url))
    .filter((fileId) => fileId.startsWith("cloud://"));

  if (fileList.length > 0) {
    try {
      await cloud.deleteFile({ fileList });
    } catch (error) {
      console.error("[contentReview] failed to delete rejected photos", {
        recordId: record._id,
        error
      });
    }
  }

  const now = new Date();
  await db.collection("checkinRecords").doc(record._id).update({
    data: {
      photos: [],
      contentReviewStatus: "rejected",
      contentReviewReason: suggest || "review",
      contentReviewCompletedAt: now,
      updatedAt: now
    }
  });
}

module.exports = {
  async handleMediaCallback({ payload = {}, cloud }) {
    requireCallbackSecret(payload);
    const db = cloud.database();
    const callback = normalizeCallback(payload);
    if (!callback.traceId || !callback.suggest) {
      throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", {
        fields: ["traceId", "suggest"]
      });
    }

    const task = await findOne(db.collection("contentReviewTasks"), {
      traceId: callback.traceId
    });
    if (!task) {
      throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", {
        traceId: callback.traceId
      });
    }
    if (task.status !== "pending") {
      return { handled: true, duplicate: true, traceId: callback.traceId };
    }

    const now = new Date();
    const nextStatus = callback.suggest === "pass" ? "passed" : "rejected";
    await db.collection("contentReviewTasks").doc(task._id).update({
      data: {
        status: nextStatus,
        suggest: callback.suggest,
        callbackPayload: callback.raw,
        completedAt: now,
        updatedAt: now
      }
    });

    const record = await findOne(db.collection("checkinRecords"), {
      _id: task.recordId
    });
    if (!record || Number(record.contentRevision || 0) !== Number(task.revision || 0)) {
      return { handled: true, stale: true, traceId: callback.traceId };
    }
    if (record.contentReviewStatus !== "pending") {
      return {
        handled: true,
        ignored: true,
        status: record.contentReviewStatus || "passed",
        traceId: callback.traceId
      };
    }

    if (nextStatus === "rejected") {
      await rejectRecord({ cloud, db, record, suggest: callback.suggest });
      return { handled: true, status: "rejected", traceId: callback.traceId };
    }

    const tasks = await findMany(db.collection("contentReviewTasks"), {
      recordId: task.recordId,
      revision: task.revision
    });
    const expectedCount = Number(record.contentReviewExpectedCount || 0);
    const allPassed = expectedCount > 0 &&
      tasks.length === expectedCount &&
      tasks.every((item) => (
      item._id === task._id ? nextStatus === "passed" : item.status === "passed"
      ));
    if (allPassed) {
      await db.collection("checkinRecords").doc(record._id).update({
        data: {
          contentReviewStatus: "passed",
          contentReviewReason: "",
          contentReviewCompletedAt: now,
          updatedAt: now
        }
      });
    }

    return {
      handled: true,
      status: allPassed ? "passed" : "pending",
      traceId: callback.traceId
    };
  }
};
