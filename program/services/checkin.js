const { callYidianApi } = require("./index");

function getCheckinContext(payload = {}, options = {}) {
  return callYidianApi("checkin", "getCheckinContext", payload, options);
}

function createCheckin(payload = {}, options = {}) {
  return callYidianApi("checkin", "createCheckin", payload, options);
}

function createMakeup(payload = {}, options = {}) {
  return callYidianApi("checkin", "createMakeup", payload, options);
}

function updateCheckinRecord(payload = {}, options = {}) {
  return callYidianApi("checkin", "updateCheckinRecord", payload, options);
}

function getCheckinRecords(payload = {}, options = {}) {
  return callYidianApi("checkin", "getCheckinRecords", payload, options);
}

module.exports = {
  getCheckinContext,
  createCheckin,
  createMakeup,
  updateCheckinRecord,
  getCheckinRecords
};
