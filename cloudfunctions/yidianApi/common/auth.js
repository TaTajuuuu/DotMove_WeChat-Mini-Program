const { AppError, ErrorCodes } = require("./errors");

function createAuthContext({ cloud, context }) {
  const wxContext = cloud.getWXContext ? cloud.getWXContext() : {};

  return {
    openid: wxContext.OPENID || "",
    appid: wxContext.APPID || "",
    unionid: wxContext.UNIONID || "",
    requestContext: context || {}
  };
}

function requireOpenid(authContext) {
  if (!authContext || !authContext.openid) {
    throw new AppError(ErrorCodes.AUTH_LOGIN_REQUIRED, "", {});
  }
  return authContext.openid;
}

async function requireCurrentUser(db, authContext) {
  const openid = requireOpenid(authContext);
  const result = await db.collection("users")
    .where({ openid })
    .limit(1)
    .get();
  const user = result.data && result.data.length ? result.data[0] : null;

  if (!user || user.status === "disabled") {
    throw new AppError(ErrorCodes.AUTH_LOGIN_REQUIRED, "", {});
  }

  return {
    userId: user._id,
    openid,
    profileNickname: user.profileNickname || "",
    avatarUrl: user.avatarUrl || "",
    status: user.status || "active"
  };
}

module.exports = {
  createAuthContext,
  requireOpenid,
  requireCurrentUser
};
