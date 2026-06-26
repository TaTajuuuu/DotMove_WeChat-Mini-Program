const { createAuthContext, requireOpenid } = require("../common/auth");

function normalizeUser(doc) {
  if (!doc) {
    return null;
  }

  return {
    userId: doc._id,
    profileNickname: doc.profileNickname || "",
    avatarUrl: doc.avatarUrl || "",
    status: doc.status || "active",
    lastLoginAt: doc.lastLoginAt || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

async function findUserByOpenid(db, openid) {
  const result = await db.collection("users")
    .where({ openid })
    .limit(1)
    .get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function createUser(db, openid, unionid, profile, now) {
  const addResult = await db.collection("users").add({
    data: {
      openid,
      unionid: unionid || "",
      profileNickname: profile.profileNickname || "",
      avatarUrl: profile.avatarUrl || "",
      status: "active",
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: "system",
      updatedBy: "system"
    }
  });

  return {
    _id: addResult._id,
    openid,
    unionid: unionid || "",
    profileNickname: profile.profileNickname || "",
    avatarUrl: profile.avatarUrl || "",
    status: "active",
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now
  };
}

async function updateLastLogin(db, userId, profile, now) {
  const updateData = {
    lastLoginAt: now,
    updatedAt: now,
    updatedBy: userId
  };

  if (Object.prototype.hasOwnProperty.call(profile, "profileNickname")) {
    updateData.profileNickname = profile.profileNickname || "";
  }

  if (Object.prototype.hasOwnProperty.call(profile, "avatarUrl")) {
    updateData.avatarUrl = profile.avatarUrl || "";
  }

  await db.collection("users").doc(userId).update({
    data: updateData
  });
}

module.exports = {
  async loginOrCreateUser({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const openid = requireOpenid(authContext);
    const db = cloud.database();
    const now = new Date();
    const profile = {};

    if (Object.prototype.hasOwnProperty.call(payload, "profileNickname")) {
      profile.profileNickname = payload.profileNickname || "";
    }

    if (Object.prototype.hasOwnProperty.call(payload, "avatarUrl")) {
      profile.avatarUrl = payload.avatarUrl || "";
    }

    let user = await findUserByOpenid(db, openid);

    if (!user) {
      user = await createUser(db, openid, authContext.unionid, profile, now);
    } else {
      await updateLastLogin(db, user._id, profile, now);
      user = {
        ...user,
        ...profile,
        lastLoginAt: now,
        updatedAt: now
      };
    }

    return {
      user: normalizeUser(user)
    };
  },

  async getCurrentUser({ cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const openid = requireOpenid(authContext);
    const db = cloud.database();
    const user = await findUserByOpenid(db, openid);

    return {
      user: normalizeUser(user)
    };
  }
};
