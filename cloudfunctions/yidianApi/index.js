const cloud = require("wx-server-sdk");
const { ok, fail } = require("./common/response");
const { ErrorCodes } = require("./common/errors");

const authDomain = require("./domains/auth");
const groupDomain = require("./domains/group");
const targetDomain = require("./domains/target");
const checkinDomain = require("./domains/checkin");
const reviewDomain = require("./domains/review");
const photoDomain = require("./domains/photo");
const systemJobDomain = require("./domains/systemJob");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const domains = {
  auth: authDomain,
  group: groupDomain,
  target: targetDomain,
  checkin: checkinDomain,
  review: reviewDomain,
  photo: photoDomain,
  systemJob: systemJobDomain
};

exports.main = async (event = {}, context = {}) => {
  const { domain, action, payload = {}, requestId = "" } = event;
  const traceId = requestId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  if (!domain || !action) {
    return fail(ErrorCodes.COMMON_INVALID_PARAM, "Missing cloud function domain or action.", {
      traceId
    });
  }

  const handlerGroup = domains[domain];
  const handler = handlerGroup && handlerGroup[action];

  if (!handler) {
    return fail(ErrorCodes.COMMON_INVALID_PARAM, "Cloud function action is not registered.", {
      traceId,
      data: { domain, action }
    });
  }

  try {
    const data = await handler({
      payload,
      event,
      context,
      cloud,
      traceId
    });
    return ok(data, { traceId });
  } catch (error) {
    return fail(error.code || ErrorCodes.COMMON_SYSTEM_ERROR, error.message || "", {
      traceId,
      data: error.details || null
    });
  }
};
