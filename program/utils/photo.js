/**
 * 打卡照片上传工具
 * 将本地临时文件上传到云存储，返回云存储文件 ID 列表
 */

/**
 * 上传打卡照片到云存储
 * @param {Object} options
 * @param {Array} options.photos - 照片列表，每项含 tempFilePath
 * @param {string} options.groupId - 小组 ID
 * @param {string} options.userId - 用户 ID
 * @returns {Promise<Array>} 上传后的照片列表，每项含 url（云存储 fileId）和 name
 */
function uploadCheckinPhotos({ photos, groupId, userId }) {
  if (!photos || photos.length === 0) {
    return Promise.resolve([]);
  }
  const timestamp = Date.now();
  const uploadTasks = photos.map((photo, index) => {
    const ext = getFileExtension(photo.tempFilePath);
    const cloudPath = `checkin_photos/${groupId}/${userId}/${timestamp}_${index}${ext}`;
    return wx.cloud.uploadFile({
      cloudPath,
      filePath: photo.tempFilePath
    }).then((res) => ({
      fileId: res.fileID,
      url: res.fileID,
      cloudPath,
      name: res.fileID.split("/").pop(),
      sort: index + 1
    }));
  });
  return Promise.all(uploadTasks);
}

/**
 * 从本地缓存获取当前用户 ID（同步）
 * @returns {string} 用户 ID，未登录时为空字符串
 */
function getCachedUserId() {
  try {
    const currentUser = wx.getStorageSync("currentUser");
    return currentUser && currentUser.userId ? currentUser.userId : "";
  } catch (e) {
    return "";
  }
}

/**
 * 缓存当前用户信息到本地存储（在登录成功后调用）
 * @param {Object} user - 用户信息
 */
function cacheCurrentUser(user) {
  try {
    wx.setStorageSync("currentUser", user);
  } catch (e) {
    // 忽略存储错误
  }
}

module.exports = {
  uploadCheckinPhotos,
  deleteCloudFiles,
  getCachedUserId,
  cacheCurrentUser
};

/**
 * 获取文件扩展名
 * @param {string} filePath - 文件路径
 * @returns {string} 扩展名（含点号）
 */
function getFileExtension(filePath) {
  if (!filePath) {
    return ".jpg";
  }
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".png")) {
    return ".png";
  }
  if (lowerPath.endsWith(".gif")) {
    return ".gif";
  }
  if (lowerPath.endsWith(".webp")) {
    return ".webp";
  }
  return ".jpg";
}

/**
 * 删除云存储文件（用于提交失败时回滚）
 * @param {Array} fileIds - 云存储文件 ID 列表
 * @returns {Promise<void>}
 */
function deleteCloudFiles(fileIds) {
  if (!fileIds || fileIds.length === 0) {
    return Promise.resolve();
  }
  return wx.cloud.deleteFile({
    fileList: fileIds
  }).then(() => {}).catch(() => {});
}
