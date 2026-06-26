const { calculateGroupStats } = require("../common/stats");

async function findMany(collection, query) {
  const result = await collection.where(query).get();
  return result.data || [];
}

async function findOne(collection, query) {
  const result = await collection.where(query).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function writeAuditLog(db, data) {
  await db.collection("auditLogs").add({ data });
}

function shouldActivate(group, now) {
  return group.status === "upcoming" && new Date(group.lifecycleStartAt).getTime() <= now.getTime();
}

function shouldArchive(group, now) {
  return group.status === "active" && new Date(group.lifecycleEndAt).getTime() < now.getTime();
}

function snapshotTargetConfig(targetConfig) {
  if (!targetConfig) {
    return {
      status: "unset",
      coinValue: 0,
      selectedGoalTypes: [],
      goals: {}
    };
  }

  return {
    targetConfigId: targetConfig._id,
    status: targetConfig.status || "unset",
    coinValue: Number(targetConfig.coinValue || 0),
    selectedGoalTypes: Array.isArray(targetConfig.selectedGoalTypes) ? targetConfig.selectedGoalTypes : [],
    goals: targetConfig.goals || {},
    savedAt: targetConfig.savedAt || null,
    lockedAt: targetConfig.lockedAt || null
  };
}

function snapshotMemberProgress(memberStats) {
  return {
    targetProgressList: memberStats.targetProgressList || [],
    overallProgress: memberStats.overallProgress,
    recordSummary: memberStats.recordSummary || {},
    progressText: memberStats.progressText || "",
    completed: Boolean(memberStats.completed),
    completedAt: memberStats.completedAt || null,
    incompleteSummary: memberStats.incompleteSummary || ""
  };
}

async function lockSetTargetConfigs(db, groupId, monthKey, now, actor) {
  const targetConfigs = await findMany(db.collection("targetConfigs"), {
    groupId,
    monthKey,
    status: "set"
  });

  for (const targetConfig of targetConfigs) {
    await db.collection("targetConfigs").doc(targetConfig._id).update({
      data: {
        status: "locked",
        lockedAt: now,
        updatedAt: now,
        updatedBy: actor
      }
    });
  }

  return targetConfigs.length;
}

async function archiveGroup(db, group, now, traceId) {
  const existingSnapshot = await findOne(db.collection("archiveSnapshots"), {
    groupId: group._id,
    monthKey: group.monthKey
  });

  if (existingSnapshot) {
    return { skipped: true, reason: "snapshotExists", archiveSnapshotId: existingSnapshot._id };
  }

  const activeMemberships = await findMany(db.collection("memberships"), {
    groupId: group._id,
    status: "active"
  });
  const targetConfigs = await findMany(db.collection("targetConfigs"), {
    groupId: group._id,
    monthKey: group.monthKey
  });
  const records = await findMany(db.collection("checkinRecords"), {
    groupId: group._id,
    monthKey: group.monthKey
  });
  const stats = calculateGroupStats({
    group,
    activeMemberships,
    targetConfigs,
    records
  });
  const targetByMembershipId = new Map(targetConfigs.map((targetConfig) => [targetConfig.membershipId, targetConfig]));
  const visibleMembershipIds = activeMemberships.map((membership) => membership._id);
  const visibleUserIds = activeMemberships.map((membership) => membership.userId);

  const archiveResult = await db.collection("archiveSnapshots").add({
    data: {
      groupId: group._id,
      monthKey: group.monthKey,
      groupName: group.name,
      lifecycleStartAt: group.lifecycleStartAt,
      lifecycleEndAt: group.lifecycleEndAt,
      archivedAt: now,
      visibleMembershipIds,
      visibleUserIds,
      activeMemberCount: stats.groupSummary.activeMemberCount,
      completedMemberCount: stats.groupSummary.completedMemberCount,
      incompleteMemberCount: stats.groupSummary.incompleteMemberCount,
      groupCompletionRate: stats.groupSummary.groupCompletionRate,
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdBy: "system",
      updatedBy: "system"
    }
  });
  const archiveSnapshotId = archiveResult._id;

  for (const memberStats of stats.members) {
    const targetConfig = targetByMembershipId.get(memberStats.membershipId);
    await db.collection("archiveMemberSnapshots").add({
      data: {
        archiveSnapshotId,
        groupId: group._id,
        membershipId: memberStats.membershipId,
        userId: memberStats.userId,
        monthKey: group.monthKey,
        nickname: memberStats.nickname,
        role: memberStats.role,
        targetConfigSnapshot: snapshotTargetConfig(targetConfig),
        progressSnapshot: snapshotMemberProgress(memberStats),
        overallProgress: memberStats.overallProgress,
        completed: Boolean(memberStats.completed),
        completedAt: memberStats.completedAt || null,
        incompleteSummary: memberStats.incompleteSummary || "",
        createdAt: now,
        updatedAt: now,
        createdBy: "system",
        updatedBy: "system"
      }
    });
  }

  const lockedTargetCount = await lockSetTargetConfigs(db, group._id, group.monthKey, now, "system");

  await db.collection("groups").doc(group._id).update({
    data: {
      status: "archived",
      inviteStatus: "disabled",
      archivedAt: now,
      updatedAt: now,
      updatedBy: "system"
    }
  });

  await writeAuditLog(db, {
    actionType: "GROUP_ARCHIVE",
    actorUserId: "system",
    actorMembershipId: "",
    targetType: "group",
    targetId: group._id,
    groupId: group._id,
    traceId: traceId || "",
    result: "success",
    resultData: {
      archiveSnapshotId,
      activeMemberCount: stats.groupSummary.activeMemberCount,
      completedMemberCount: stats.groupSummary.completedMemberCount,
      lockedTargetCount
    },
    createdAt: now
  });

  return {
    skipped: false,
    groupId: group._id,
    archiveSnapshotId,
    activeMemberCount: stats.groupSummary.activeMemberCount,
    completedMemberCount: stats.groupSummary.completedMemberCount,
    lockedTargetCount
  };
}

module.exports = {
  async activateUpcomingGroups({ cloud, traceId }) {
    const db = cloud.database();
    const now = new Date();
    const upcomingGroups = await findMany(db.collection("groups"), { status: "upcoming" });
    const candidates = upcomingGroups.filter((group) => shouldActivate(group, now));
    const activatedGroups = [];

    for (const group of candidates) {
      const lockedTargetCount = await lockSetTargetConfigs(db, group._id, group.monthKey, now, "system");
      await db.collection("groups").doc(group._id).update({
        data: {
          status: "active",
          updatedAt: now,
          updatedBy: "system"
        }
      });
      await writeAuditLog(db, {
        actionType: "GROUP_ACTIVATE",
        actorUserId: "system",
        actorMembershipId: "",
        targetType: "group",
        targetId: group._id,
        groupId: group._id,
        traceId: traceId || "",
        result: "success",
        resultData: { groupId: group._id, lockedTargetCount },
        createdAt: now
      });
      activatedGroups.push({ groupId: group._id, lockedTargetCount });
    }

    return {
      activatedCount: activatedGroups.length,
      activatedGroups,
      checkedCount: upcomingGroups.length
    };
  },

  async archiveExpiredGroups({ cloud, traceId }) {
    const db = cloud.database();
    const now = new Date();
    const activeGroups = await findMany(db.collection("groups"), { status: "active" });
    const candidates = activeGroups.filter((group) => shouldArchive(group, now));
    const archivedGroups = [];
    const skippedGroups = [];

    for (const group of candidates) {
      const result = await archiveGroup(db, group, now, traceId);
      if (result.skipped) {
        skippedGroups.push({ groupId: group._id, reason: result.reason, archiveSnapshotId: result.archiveSnapshotId });
      } else {
        archivedGroups.push(result);
      }
    }

    return {
      archivedCount: archivedGroups.length,
      skippedCount: skippedGroups.length,
      checkedCount: activeGroups.length,
      archivedGroups,
      skippedGroups
    };
  }
};
