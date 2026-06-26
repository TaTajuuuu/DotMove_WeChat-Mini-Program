const { calculateGroupStats } = require("../common/stats");

async function findOne(collection, query) {
  const result = await collection.where(query).limit(1).get();
  return result.data && result.data.length ? result.data[0] : null;
}

async function findMany(collection, query) {
  const result = await collection.where(query).get();
  return result.data || [];
}

function isDue(startOrEndAt, now, mode) {
  const time = new Date(startOrEndAt).getTime();
  return mode === "start" ? now.getTime() >= time : now.getTime() > time;
}

function progressSnapshotFromList(targetProgressList) {
  const snapshot = {
    calorieTotal: null,
    durationTotal: null,
    exerciseDays: null,
    exerciseTimes: null,
    runningDistance: null,
    cyclingDistance: null,
    ringClosedDays: null
  };

  for (const item of targetProgressList || []) {
    snapshot[item.goalType] = item;
  }

  return snapshot;
}

async function writeAuditLog(db, data) {
  await db.collection("auditLogs").add({ data });
}

async function lockSetTargets(db, group, now) {
  const setTargets = await findMany(db.collection("targetConfigs"), {
    groupId: group._id,
    monthKey: group.monthKey,
    status: "set"
  });

  for (const targetConfig of setTargets) {
    await db.collection("targetConfigs").doc(targetConfig._id).update({
      data: {
        status: "locked",
        lockedAt: now,
        updatedAt: now,
        updatedBy: "system"
      }
    });
  }

  return setTargets.length;
}

async function archiveGroup(db, group, now, traceId) {
  const existingSnapshot = await findOne(db.collection("archiveSnapshots"), {
    groupId: group._id,
    monthKey: group.monthKey
  });

  if (existingSnapshot) {
    if (group.status !== "archived") {
      await db.collection("groups").doc(group._id).update({
        data: {
          status: "archived",
          inviteStatus: "disabled",
          archivedAt: existingSnapshot.archivedAt || now,
          updatedAt: now,
          updatedBy: "system"
        }
      });
    }
    return {
      groupId: group._id,
      archiveSnapshotId: existingSnapshot._id,
      skipped: true
    };
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
  const visibleMembershipIds = activeMemberships.map((membership) => membership._id);
  const visibleUserIds = activeMemberships.map((membership) => membership.userId);
  const archiveAddResult = await db.collection("archiveSnapshots").add({
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
  const archiveSnapshotId = archiveAddResult._id;
  const targetByMembershipId = new Map(targetConfigs.map((targetConfig) => [targetConfig.membershipId, targetConfig]));

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
        targetConfigSnapshot: {
          coinValue: targetConfig ? Number(targetConfig.coinValue || 0) : 0,
          selectedGoalTypes: targetConfig && Array.isArray(targetConfig.selectedGoalTypes) ? targetConfig.selectedGoalTypes : [],
          goals: targetConfig ? targetConfig.goals || {} : {}
        },
        progressSnapshot: progressSnapshotFromList(memberStats.targetProgressList),
        overallProgress: memberStats.overallProgress,
        completed: memberStats.completed,
        completedAt: memberStats.completedAt,
        incompleteSummary: memberStats.incompleteSummary,
        createdAt: now,
        updatedAt: now,
        createdBy: "system",
        updatedBy: "system"
      }
    });
  }

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
    targetType: "group",
    targetId: group._id,
    groupId: group._id,
    traceId: traceId || "",
    result: "success",
    resultData: {
      archiveSnapshotId,
      activeMemberCount: stats.groupSummary.activeMemberCount,
      completedMemberCount: stats.groupSummary.completedMemberCount,
      groupCompletionRate: stats.groupSummary.groupCompletionRate
    },
    createdAt: now
  });

  return {
    groupId: group._id,
    archiveSnapshotId,
    skipped: false
  };
}

module.exports = {
  async activateUpcomingGroups({ cloud, traceId }) {
    const db = cloud.database();
    const now = new Date();
    const upcomingGroups = await findMany(db.collection("groups"), { status: "upcoming" });
    const activated = [];

    for (const group of upcomingGroups) {
      if (!isDue(group.lifecycleStartAt, now, "start")) {
        continue;
      }

      const lockedTargetCount = await lockSetTargets(db, group, now);
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
        targetType: "group",
        targetId: group._id,
        groupId: group._id,
        traceId: traceId || "",
        result: "success",
        resultData: { lockedTargetCount },
        createdAt: now
      });
      activated.push({ groupId: group._id, lockedTargetCount });
    }

    return {
      activatedCount: activated.length,
      activated
    };
  },

  async archiveExpiredGroups({ cloud, traceId }) {
    const db = cloud.database();
    const now = new Date();
    const activeGroups = await findMany(db.collection("groups"), { status: "active" });
    const archived = [];
    const skipped = [];

    for (const group of activeGroups) {
      if (group.status === "dissolved" || !isDue(group.lifecycleEndAt, now, "end")) {
        continue;
      }

      const result = await archiveGroup(db, group, now, traceId);
      if (result.skipped) {
        skipped.push(result);
      } else {
        archived.push(result);
      }
    }

    return {
      archivedCount: archived.length,
      skippedCount: skipped.length,
      archived,
      skipped
    };
  }
};
