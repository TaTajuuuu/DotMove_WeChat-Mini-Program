const { callYidianApi } = require("./index");

function loginOrCreateUser(payload = {}, options = {}) {
  return callYidianApi("auth", "loginOrCreateUser", payload, options);
}

function getCurrentUser(payload = {}, options = {}) {
  return callYidianApi("auth", "getCurrentUser", payload, options);
}

module.exports = {
  loginOrCreateUser,
  getCurrentUser
};
