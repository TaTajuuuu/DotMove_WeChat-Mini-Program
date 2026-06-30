function createMediaError(source) {
  const errMsg = source && source.errMsg ? source.errMsg : "";
  const privacyDenied = /privacy|authorize|auth deny/i.test(errMsg);
  const error = new Error(
    privacyDenied
      ? "需要同意隐私保护指引后才能选择运动照片。"
      : "无法打开相册，请检查微信权限后重试。"
  );
  error.code = privacyDenied ? "PRIVACY_AUTH_REQUIRED" : "MEDIA_CHOOSE_FAILED";
  error.errMsg = errMsg;
  return error;
}

const PRIVACY_CONFIRMED_KEY = "yidianPrivacyConfirmed";
let privacyPromptHandler = null;
let privacyAuthorizationResolver = null;
let privacyListenerRegistered = false;

function hasLocalPrivacyConfirmation() {
  try {
    return wx.getStorageSync(PRIVACY_CONFIRMED_KEY) === true;
  } catch (error) {
    return false;
  }
}

function markPrivacyAuthorized() {
  try {
    wx.setStorageSync(PRIVACY_CONFIRMED_KEY, true);
  } catch (error) {
    // The platform authorization still applies when local storage is unavailable.
  }
}

function clearPrivacyAuthorization() {
  try {
    wx.removeStorageSync(PRIVACY_CONFIRMED_KEY);
  } catch (error) {
    // Ignore local storage cleanup failures.
  }
}

function ensurePrivacyListener() {
  if (
    privacyListenerRegistered ||
    typeof wx.onNeedPrivacyAuthorization !== "function"
  ) {
    return;
  }

  wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
    privacyAuthorizationResolver = resolve;
    if (typeof privacyPromptHandler === "function") {
      privacyPromptHandler(eventInfo || {});
    }
  });
  privacyListenerRegistered = true;
}

function setPrivacyPromptHandler(handler) {
  privacyPromptHandler = typeof handler === "function" ? handler : null;
  ensurePrivacyListener();
}

function resolvePrivacyAuthorization(agreed) {
  if (typeof privacyAuthorizationResolver !== "function") {
    return false;
  }

  const resolve = privacyAuthorizationResolver;
  privacyAuthorizationResolver = null;
  resolve({
    buttonId: agreed ? "agree-btn" : "disagree-btn",
    event: agreed ? "agree" : "disagree"
  });
  return true;
}

function needsPrivacyAuthorization() {
  if (!hasLocalPrivacyConfirmation()) {
    return Promise.resolve(true);
  }
  if (typeof wx.getPrivacySetting !== "function") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    wx.getPrivacySetting({
      success(setting) {
        resolve(Boolean(setting && setting.needAuthorization));
      },
      fail() {
        resolve(true);
      }
    });
  });
}

function chooseImageMedia(options = {}) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: options.count || 1,
      mediaType: ["image"],
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: resolve,
      fail(error) {
        const errMsg = error && error.errMsg ? error.errMsg : "";
        if (/cancel/i.test(errMsg)) {
          resolve({ tempFiles: [] });
          return;
        }
        reject(createMediaError(error));
      },
    });
  });
}

function openPrivacyContract() {
  if (typeof wx.openPrivacyContract !== "function") {
    wx.showToast({ title: "当前微信版本暂不支持查看", icon: "none" });
    return;
  }

  wx.openPrivacyContract({
    fail() {
      wx.showToast({ title: "隐私保护指引打开失败", icon: "none" });
    }
  });
}

function copyText(text) {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) {
    return Promise.reject(new Error("复制内容为空。"));
  }

  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: value,
      success() {
        setPrivacyPromptHandler(null);
        resolve();
      },
      fail(error) {
        setPrivacyPromptHandler(null);
        reject(error || new Error("setClipboardData failed"));
      }
    });
  });
}

module.exports = {
  needsPrivacyAuthorization,
  markPrivacyAuthorized,
  clearPrivacyAuthorization,
  setPrivacyPromptHandler,
  resolvePrivacyAuthorization,
  chooseImageMedia,
  openPrivacyContract,
  copyText
};
