const { callYidianApi } = require("./index");

function createPhotoUploadSlots(payload = {}, options = {}) {
  return callYidianApi("photo", "createPhotoUploadSlots", payload, options);
}

function getPhotoTempUrls(payload = {}, options = {}) {
  return callYidianApi("photo", "getPhotoTempUrls", payload, options);
}

module.exports = {
  createPhotoUploadSlots,
  getPhotoTempUrls
};
