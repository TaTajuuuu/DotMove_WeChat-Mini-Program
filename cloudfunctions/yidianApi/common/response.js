const { ErrorMessages } = require("./errors");

function ok(data = {}, options = {}) {
  return {
    success: true,
    code: "SUCCESS",
    message: ErrorMessages.SUCCESS,
    data,
    traceId: options.traceId || ""
  };
}

function fail(code, message = "", options = {}) {
  return {
    success: false,
    code,
    message: message || ErrorMessages[code] || ErrorMessages.COMMON_SYSTEM_ERROR,
    data: Object.prototype.hasOwnProperty.call(options, "data") ? options.data : null,
    traceId: options.traceId || ""
  };
}

module.exports = {
  ok,
  fail
};
