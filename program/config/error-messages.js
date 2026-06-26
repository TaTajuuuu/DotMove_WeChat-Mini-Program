const ErrorMessages = {
  SUCCESS: "操作成功",
  COMMON_INVALID_PARAM: "请求参数无效。",
  COMMON_DUPLICATE_REQUEST: "请求处理中，请勿重复提交。",
  COMMON_SYSTEM_ERROR: "系统异常，请稍后重试。",
  AUTH_LOGIN_REQUIRED: "请先登录后继续。",
  AUTH_FORBIDDEN: "无权限查看。",
  GROUP_NOT_STARTED: "小组尚未开始，暂不能打卡或补卡。",
  GROUP_ARCHIVED: "归档小组仅可查看。",
  GROUP_DISSOLVED: "小组已解散。",
  GROUP_FULL: "小组人数已满。",
  GROUP_INVITE_INVALID: "邀请码无效。",
  MEMBER_NOT_ACTIVE: "你已不属于该小组。",
  MEMBER_CREATOR_TRANSFER_REQUIRED: "请先转让创建者身份。",
  TARGET_REQUIRED: "请先设置目标。",
  TARGET_LOCKED: "目标已锁定。",
  TARGET_INVALID_VALUE: "请输入有效目标值。",
  TARGET_INVALID_COIN: "请输入有效一点币值。",
  CHECKIN_INVALID_METRICS: "请输入有效运动数据。",
  CHECKIN_LIMIT_REACHED: "该运动日期已达到 5 次有效打卡上限。",
  CHECKIN_EDIT_EXPIRED: "仅可在提交当天修改。",
  MAKEUP_USE_CHECKIN_TODAY: "今日运动请使用打卡。",
  MAKEUP_DATE_OUT_OF_RANGE: "只能补昨日或前天的卡。",
  MAKEUP_DAILY_LIMIT_REACHED: "今日补卡次数已用完。",
  PHOTO_COUNT_INVALID: "请上传 1 至 3 张运动照片。",
  PHOTO_TYPE_INVALID: "仅支持上传静态运动照片。",
  PHOTO_UPLOAD_FAILED: "运动照片上传失败，请重试。",
  PHOTO_LOAD_FAILED: "照片加载失败，请重试。",
  REMARK_TOO_LONG: "备注最多 100 字。",
  STATS_TARGET_UNSET: "未设置目标。",
  STATS_NO_ACTIVE_MEMBER: "暂无有效成员。",
  ARCHIVE_NOT_FOUND: "暂无可查看归档。",
  SYSTEM_NOT_IMPLEMENTED: "功能尚未实现。"
};

const ErrorPageStates = {
  AUTH_LOGIN_REQUIRED: "forbidden",
  AUTH_FORBIDDEN: "forbidden",
  GROUP_ARCHIVED: "readonly",
  GROUP_DISSOLVED: "forbidden",
  MEMBER_NOT_ACTIVE: "forbidden",
  TARGET_LOCKED: "readonly",
  STATS_TARGET_UNSET: "empty",
  STATS_NO_ACTIVE_MEMBER: "empty",
  ARCHIVE_NOT_FOUND: "empty",
  PHOTO_LOAD_FAILED: "error"
};

function getErrorMessage(code, fallback = "") {
  return ErrorMessages[code] || fallback || ErrorMessages.COMMON_SYSTEM_ERROR;
}

function getErrorPageState(code) {
  return ErrorPageStates[code] || "error";
}

module.exports = {
  ErrorMessages,
  ErrorPageStates,
  getErrorMessage,
  getErrorPageState
};
