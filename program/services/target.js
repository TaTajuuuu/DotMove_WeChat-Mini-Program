const { callYidianApi } = require("./index");

function getTargetConfig(payload = {}, options = {}) {
  return callYidianApi("target", "getTargetConfig", payload, options);
}

function saveTargetConfig(payload = {}, options = {}) {
  return callYidianApi("target", "saveTargetConfig", payload, options);
}

function getMyTargetDetail(payload = {}, options = {}) {
  return callYidianApi("target", "getMyTargetDetail", payload, options);
}

function getMemberTargetDetail(payload = {}, options = {}) {
  return callYidianApi("target", "getMemberTargetDetail", payload, options);
}

module.exports = {
  getTargetConfig,
  saveTargetConfig,
  getMyTargetDetail,
  getMemberTargetDetail
};
