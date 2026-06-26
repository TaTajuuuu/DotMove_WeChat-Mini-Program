const { callYidianApi } = require("./index");

function activateUpcomingGroups(payload = {}, options = {}) {
  return callYidianApi("systemJob", "activateUpcomingGroups", payload, options);
}

function archiveExpiredGroups(payload = {}, options = {}) {
  return callYidianApi("systemJob", "archiveExpiredGroups", payload, options);
}

module.exports = {
  activateUpcomingGroups,
  archiveExpiredGroups
};
