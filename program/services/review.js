const { callYidianApi } = require("./index");

function getReviewHome(payload = {}, options = {}) {
  return callYidianApi("review", "getReviewHome", payload, options);
}

function getArchiveReviewDetail(payload = {}, options = {}) {
  return callYidianApi("review", "getArchiveReviewDetail", payload, options);
}

function getArchiveMemberTargetDetail(payload = {}, options = {}) {
  return callYidianApi("review", "getArchiveMemberTargetDetail", payload, options);
}

module.exports = {
  getReviewHome,
  getArchiveReviewDetail,
  getArchiveMemberTargetDetail
};
