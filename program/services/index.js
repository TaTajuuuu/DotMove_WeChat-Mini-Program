const { getErrorMessage, getErrorPageState } = require("../config/error-messages");

const CLOUD_FUNCTION_NAME = "yidianApi";

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createServiceError(response) {
  const code = response && response.code ? response.code : "COMMON_SYSTEM_ERROR";
  const error = new Error(getErrorMessage(code, response && response.message));
  error.name = "ServiceError";
  error.code = code;
  error.serverMessage = response && response.message ? response.message : "";
  error.pageState = getErrorPageState(code);
  error.traceId = response && response.traceId ? response.traceId : "";
  error.data = response ? response.data : null;
  return error;
}

async function callYidianApi(domain, action, payload = {}, options = {}) {
  const requestId = options.requestId || createRequestId();
  const timeout = options.timeout || 60000;

  if (options.loadingText) {
    wx.showLoading({
      title: options.loadingText,
      mask: true
    });
  }

  try {
    const cloudResult = await wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data: {
        domain,
        action,
        payload,
        requestId
      },
      timeout
    });
    const response = cloudResult && cloudResult.result ? cloudResult.result : cloudResult;

    if (!response || response.success !== true) {
      throw createServiceError(response);
    }

    return {
      data: response.data || {},
      traceId: response.traceId || "",
      requestId
    };
  } catch (error) {
    const errorDetails = {
      domain,
      action,
      requestId,
      code: error && error.code ? error.code : "COMMON_SYSTEM_ERROR",
      message: error && error.message ? error.message : "",
      serverMessage: error && error.serverMessage ? error.serverMessage : "",
      traceId: error && error.traceId ? error.traceId : "",
      data: error && error.data ? error.data : null,
      errMsg: error && error.errMsg ? error.errMsg : ""
    };
    console.error(`[yidianApi] call failed ${JSON.stringify(errorDetails)}`);

    if (error && error.name === "ServiceError") {
      throw error;
    }

    throw createServiceError({
      code: "COMMON_SYSTEM_ERROR",
      message: error && error.message ? error.message : "",
      data: null,
      traceId: ""
    });
  } finally {
    if (options.loadingText) {
      wx.hideLoading();
    }
  }
}

module.exports = {
  CLOUD_FUNCTION_NAME,
  createRequestId,
  createServiceError,
  callYidianApi
};
