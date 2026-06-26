const { callYidianApi } = require("./index");

function getHomeEntry(payload = {}, options = {}) {
  return callYidianApi("group", "getHomeEntry", payload, options);
}

function createGroup(payload = {}, options = {}) {
  return callYidianApi("group", "createGroup", payload, options);
}

function getJoinPreview(payload = {}, options = {}) {
  return callYidianApi("group", "getJoinPreview", payload, options);
}

function joinGroup(payload = {}, options = {}) {
  return callYidianApi("group", "joinGroup", payload, options);
}

function getGroupDetail(payload = {}, options = {}) {
  return callYidianApi("group", "getGroupDetail", payload, options);
}

function getGroupManagement(payload = {}, options = {}) {
  return callYidianApi("group", "getGroupManagement", payload, options);
}

function updateGroupName(payload = {}, options = {}) {
  return callYidianApi("group", "updateGroupName", payload, options);
}

function transferCreator(payload = {}, options = {}) {
  return callYidianApi("group", "transferCreator", payload, options);
}

function exitGroup(payload = {}, options = {}) {
  return callYidianApi("group", "exitGroup", payload, options);
}

function removeMember(payload = {}, options = {}) {
  return callYidianApi("group", "removeMember", payload, options);
}

function dissolveGroup(payload = {}, options = {}) {
  return callYidianApi("group", "dissolveGroup", payload, options);
}

module.exports = {
  getHomeEntry,
  createGroup,
  getJoinPreview,
  joinGroup,
  getGroupDetail,
  getGroupManagement,
  updateGroupName,
  transferCreator,
  exitGroup,
  removeMember,
  dissolveGroup
};
