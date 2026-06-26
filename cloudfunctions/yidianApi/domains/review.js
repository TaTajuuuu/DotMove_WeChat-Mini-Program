const { createAuthContext, requireCurrentUser } = require("../common/auth");
const { AppError, ErrorCodes } = require("../common/errors");

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function findOne(collection, query) {
  const result = await collection.where(query).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function findMany(collection, query) {
  const result = await collection.where(query).get();
  return result.data || [];
}

function assertArchiveVisible(snapshot, userId) {
  if (!snapshot || snapshot.status !== "active" || !Array.isArray(snapshot.visibleUserIds) || !snapshot.visibleUserIds.includes(userId)) {
    throw new AppError(ErrorCodes.ARCHIVE_NOT_FOUND, "", {});
  }
}

function toArchiveSummary(snapshot) {
  return {
    archiveSnapshotId: snapshot._id,
    groupId: snapshot.groupId,
    monthKey: snapshot.monthKey,
    groupName: snapshot.groupName,
    archivedAt: snapshot.archivedAt,
    activeMemberCount: snapshot.activeMemberCount || 0,
    completedMemberCount: snapshot.completedMemberCount || 0,
    incompleteMemberCount: snapshot.incompleteMemberCount || 0,
    groupCompletionRate: snapshot.groupCompletionRate,
    readonly: true,
    canEdit: false
  };
}

function toMemberArchiveSummary(snapshot) {
  return {
    archiveMemberSnapshotId: snapshot._id,
    archiveSnapshotId: snapshot.archiveSnapshotId,
    groupId: snapshot.groupId,
    membershipId: snapshot.membershipId,
    userId: snapshot.userId,
    monthKey: snapshot.monthKey,
    nickname: snapshot.nickname,
    role: snapshot.role,
    overallProgress: snapshot.overallProgress,
    completed: snapshot.completed,
    completedAt: snapshot.completedAt || null,
    incompleteSummary: snapshot.incompleteSummary || "",
    readonly: true,
    canEdit: false
  };
}

async function findVisibleArchiveSnapshot(db, payload, userId) {
  const archiveSnapshotId = trimString(payload.archiveSnapshotId);
  const groupId = trimString(payload.groupId);
  const monthKey = trimString(payload.monthKey);
  let snapshot = null;

  if (archiveSnapshotId) {
    snapshot = await findOne(db.collection("archiveSnapshots"), { _id: archiveSnapshotId });
  } else if (groupId && monthKey) {
    snapshot = await findOne(db.collection("archiveSnapshots"), { groupId, monthKey });
  } else {
    throw new AppError(ErrorCodes.COMMON_INVALID_PARAM, "", { field: "archiveSnapshotId" });
  }

  assertArchiveVisible(snapshot, userId);
  return snapshot;
}

module.exports = {
  async getReviewHome({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const monthKey = trimString(payload.monthKey);
    const snapshots = await findMany(db.collection("archiveSnapshots"), { status: "active" });
    const archives = snapshots
      .filter((snapshot) => Array.isArray(snapshot.visibleUserIds) && snapshot.visibleUserIds.includes(currentUser.userId))
      .filter((snapshot) => !monthKey || snapshot.monthKey === monthKey)
      .sort((left, right) => String(right.archivedAt || "").localeCompare(String(left.archivedAt || "")))
      .map(toArchiveSummary);

    return {
      archives,
      empty: archives.length === 0,
      readonly: true,
      canEdit: false
    };
  },

  async getArchiveReviewDetail({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const snapshot = await findVisibleArchiveSnapshot(db, payload, currentUser.userId);
    const memberSnapshots = await findMany(db.collection("archiveMemberSnapshots"), {
      archiveSnapshotId: snapshot._id
    });

    return {
      archive: toArchiveSummary(snapshot),
      members: memberSnapshots
        .sort((left, right) => {
          if (left.role === right.role) {
            return String(left.nickname || "").localeCompare(String(right.nickname || ""));
          }
          return left.role === "creator" ? -1 : 1;
        })
        .map(toMemberArchiveSummary),
      readonly: true,
      canEdit: false
    };
  },

  async getArchiveMemberTargetDetail({ payload = {}, cloud, context }) {
    const authContext = createAuthContext({ cloud, context });
    const db = cloud.database();
    const currentUser = await requireCurrentUser(db, authContext);
    const archiveMemberSnapshotId = trimString(payload.archiveMemberSnapshotId);
    const membershipId = trimString(payload.membershipId);
    const archiveSnapshot = await findVisibleArchiveSnapshot(db, payload, currentUser.userId);
    const memberSnapshot = archiveMemberSnapshotId
      ? await findOne(db.collection("archiveMemberSnapshots"), { _id: archiveMemberSnapshotId })
      : await findOne(db.collection("archiveMemberSnapshots"), {
        archiveSnapshotId: archiveSnapshot._id,
        membershipId
      });

    if (!memberSnapshot || memberSnapshot.archiveSnapshotId !== archiveSnapshot._id) {
      throw new AppError(ErrorCodes.ARCHIVE_NOT_FOUND, "", {});
    }

    return {
      archive: toArchiveSummary(archiveSnapshot),
      member: {
        ...toMemberArchiveSummary(memberSnapshot),
        targetConfigSnapshot: memberSnapshot.targetConfigSnapshot || {},
        progressSnapshot: memberSnapshot.progressSnapshot || {}
      },
      readonly: true,
      canEdit: false
    };
  }
};
