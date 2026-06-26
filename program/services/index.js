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
  error.pageState = getErrorPageState(code);
  error.traceId = response && response.traceId ? response.traceId : "";
  error.data = response ? response.data : null;
  return error;
}

async function callYidianApi(domain, action, payload = {}, options = {}) {
  const requestId = options.requestId || createRequestId();

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
      timeout: 15000
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
