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

// 处理定时触发器调用
async function handleScheduledTrigger(event, traceId) {
  const { triggerName, triggerTime } = event;
  console.log(`[定时触发器] 名称: ${triggerName}, 时间: ${triggerTime}, traceId: ${traceId}`);

  try {
    let result = {};

    switch (triggerName) {
      case "monthlyGroupStatusTransition":
        // 每月 1 号凌晨 2 点执行：激活即将开始的小组 + 归档过期的小组
        console.log(`[定时触发器] 开始执行月度小组状态流转...`);

        const activateResult = await systemJobDomain.activateUpcomingGroups({
          payload: {},
          event,
          context: {},
          cloud,
          traceId
        });
        console.log(`[定时触发器] 激活小组完成:`, activateResult);

        const archiveResult = await systemJobDomain.archiveExpiredGroups({
          payload: {},
          event,
          context: {},
          cloud,
          traceId
        });
        console.log(`[定时触发器] 归档小组完成:`, archiveResult);

        result = {
          activated: activateResult,
          archived: archiveResult
        };
        break;

      default:
        console.warn(`[定时触发器] 未知的触发器名称: ${triggerName}`);
        return fail(ErrorCodes.COMMON_INVALID_PARAM, `Unknown trigger: ${triggerName}`, { traceId });
    }

    console.log(`[定时触发器] 执行完成: ${triggerName}, 结果:`, result);
    return ok(result, { traceId, triggerName, triggerTime });
  } catch (error) {
    console.error(`[定时触发器] 执行失败: ${triggerName}, 错误:`, error);
    return fail(error.code || ErrorCodes.COMMON_SYSTEM_ERROR, error.message || "Scheduled task failed", {
      traceId,
      triggerName,
      triggerTime
    });
  }
}

exports.main = async (event = {}, context = {}) => {
  const { domain, action, payload = {}, requestId = "" } = event;
  const traceId = requestId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // 处理定时触发器调用
  if (event.triggerName) {
    return await handleScheduledTrigger(event, traceId);
  }

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
