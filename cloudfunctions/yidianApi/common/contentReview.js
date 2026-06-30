const { AppError, ErrorCodes } = require("./errors");

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getOpenApiErrorCode(error) {
  return Number((error && (error.errCode || error.errcode || error.code)) || 0);
}

function getSuggest(result) {
  return trimString(
    result &&
    (
      result.suggest ||
      (result.result && result.result.suggest) ||
      (result.detail && result.detail.suggest)
    )
  ).toLowerCase();
}

async function assertTextContentSafe(cloud, openid, content) {
  const text = trimString(content);
  if (!text) return;

  try {
    const result = await cloud.openapi.security.msgSecCheck({
      openid,
      scene: 2,
      version: 2,
      content: text
    });
    const suggest = getSuggest(result);
    if (suggest && suggest !== "pass") {
      throw new AppError(ErrorCodes.CONTENT_TEXT_REJECTED, "", { suggest });
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (getOpenApiErrorCode(error) === 87014) {
      throw new AppError(ErrorCodes.CONTENT_TEXT_REJECTED, "", {});
    }
    throw new AppError(ErrorCodes.CONTENT_REVIEW_FAILED, "", {
      stage: "msgSecCheck",
      errCode: getOpenApiErrorCode(error),
      errMsg: trimString(error && error.errMsg)
    });
  }
}

async function resolveReviewUrls(cloud, photos) {
  const fileIds = photos
    .map((photo) => trimString(photo.fileId || photo.url))
    .filter((fileId) => fileId.startsWith("cloud://"));
  const result = await cloud.getTempFileURL({ fileList: fileIds });
  const urlByFileId = new Map((result.fileList || []).map((item) => [
    item.fileID,
    item.tempFileURL || ""
  ]));

  return photos.map((photo) => {
    const fileId = trimString(photo.fileId || photo.url);
    const mediaUrl = fileId.startsWith("http") ? fileId : urlByFileId.get(fileId);
    if (!mediaUrl) {
      throw new AppError(ErrorCodes.CONTENT_REVIEW_FAILED, "", {
        stage: "resolvePhotoUrl",
        fileId
      });
    }
    return { fileId, mediaUrl };
  });
}

async function submitPhotoReviews({
  cloud,
  db,
  openid,
  recordId,
  revision,
  photos
}) {
  const reviewPhotos = await resolveReviewUrls(cloud, photos);
  const now = new Date();
  const tasks = [];

  for (const photo of reviewPhotos) {
    const result = await cloud.openapi.security.mediaCheckAsync({
      openid,
      scene: 2,
      version: 2,
      mediaType: 2,
      mediaUrl: photo.mediaUrl
    });
    const traceId = trimString(result && (result.traceId || result.trace_id));
    if (!traceId) {
      throw new AppError(ErrorCodes.CONTENT_REVIEW_FAILED, "", {
        stage: "mediaCheckAsync",
        fileId: photo.fileId
      });
    }

    await db.collection("contentReviewTasks").add({
      data: {
        traceId,
        recordId,
        revision,
        fileId: photo.fileId,
        status: "pending",
        createdAt: now,
        updatedAt: now
      }
    });
    tasks.push({ traceId, fileId: photo.fileId });
  }

  await db.collection("checkinRecords").doc(recordId).update({
    data: {
      contentReviewTraceIds: tasks.map((task) => task.traceId),
      contentReviewRequestedAt: now,
      updatedAt: now
    }
  });

  return tasks;
}

module.exports = {
  assertTextContentSafe,
  getSuggest,
  submitPhotoReviews
};
