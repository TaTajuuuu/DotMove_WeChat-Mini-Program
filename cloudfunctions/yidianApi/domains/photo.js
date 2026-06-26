const { createAuthContext, requireCurrentUser } = require("../common/auth");
const { AppError, ErrorCodes } = require("../common/errors");

const STATIC_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

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

function normalizeCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 3) {
    throw new AppError(ErrorCodes.PHOTO_COUNT_INVALID, "", { field: "count" });
  }
  return count;
}

function normalizeExtension(value) {
  const extension = trimString(value).replace(/^\./, "").toLowerCase() || "jpg";
  if (!STATIC_EXTENSIONS.has(extension)) {
    throw new AppError(ErrorCodes.PHOTO_TYPE_INVALID, "", { extension });
  }
  return extension === "jpeg" ? "jpg" : extension;
}

async function findOne(collection, query) {
  const result = await collection.where(query).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function assertActiveMembership(db, groupId, userId) {
  const group = await findOne(db.collection("groups"), { _id: groupId });
  if (!group || group.status === "dissolved") {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, "", { groupId });
  }
  const membership = await findOne(db.collection("memberships"), {
    groupId,
    userId,
    status: "active"
  });
  if (!membership) {
    throw new AppError(ErrorCodes.MEMBER_NOT_ACTIVE, "", { groupId });
  }
  return { group, membership };
}

module.exports = {
  async createPhotoUploadSlots({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const count = normalizeCount(payload.count);
    const extension = normalizeExtension(payload.extension || "jpg");

    await assertActiveMembership(db, groupId, currentUser.userId);

    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const slots = Array.from({ length: count }).map((_, index) => ({
      sort: index + 1,
      cloudPath: `checkin_photos/${groupId}/${currentUser.userId}/${timestamp}_${random}_${index + 1}.${extension}`
    }));

    return { slots };
  },

  async getPhotoTempUrls({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const groupId = normalizeId(payload.groupId, "groupId");
    const fileIds = Array.isArray(payload.fileIds) ? payload.fileIds.map(trimString).filter(Boolean) : [];

    if (fileIds.length < 1 || fileIds.length > 20) {
      throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field: "fileIds" });
    }

    await assertActiveMembership(db, groupId, currentUser.userId);

    const result = await cloud.getTempFileURL({ fileList: fileIds });
    return {
      files: (result.fileList || []).map((file) => ({
        fileId: file.fileID,
        tempFileURL: file.tempFileURL || "",
        status: file.status,
        error: file.errMsg || ""
      }))
    };
  }
};
