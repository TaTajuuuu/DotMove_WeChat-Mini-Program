const EFFECTIVE_RECORD_STATUSES = new Set(["valid", "edited"]);
const { formatDateKey } = require("./date");

function round2(value) {
  return Math.round(value * 100) / 100;
}

function percent(doneValue, targetValue) {
  if (!targetValue || targetValue <= 0) {
    return 0;
  }
  return round2(Math.min(doneValue / targetValue, 1) * 100);
}

function sortRecords(records) {
  return records.slice().sort((left, right) => {
    const dateCompare = String(left.sportDate || "").localeCompare(String(right.sportDate || ""));
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return String(left.submitAt || left.createdAt || "").localeCompare(String(right.submitAt || right.createdAt || ""));
  });
}

function isTargetConfigured(targetConfig) {
  return Boolean(
    targetConfig &&
    (targetConfig.status === "set" || targetConfig.status === "locked") &&
    Array.isArray(targetConfig.selectedGoalTypes) &&
    targetConfig.selectedGoalTypes.length > 0
  );
}

function getContentReviewStatus(record) {
  return record && record.contentReviewStatus
    ? record.contentReviewStatus
    : "passed";
}

function isRecordContextEligible(record, membership, targetConfig, group) {
  if (!record || !membership || !targetConfig || !group) {
    return false;
  }
  if (!EFFECTIVE_RECORD_STATUSES.has(record.status)) {
    return false;
  }
  if (record.groupId !== group._id || record.monthKey !== group.monthKey) {
    return false;
  }
  if (record.membershipId !== membership._id || membership.status !== "active") {
    return false;
  }
  if (!isTargetConfigured(targetConfig)) {
    return false;
  }
  if (!String(record.sportDate || "").startsWith(group.monthKey)) {
    return false;
  }
  return record.membershipActivePeriodSeq === membership.activePeriodSeq || record.makeupForExitedPeriod === true;
}

function isEligibleRecord(record, membership, targetConfig, group) {
  return isRecordContextEligible(record, membership, targetConfig, group) &&
    getContentReviewStatus(record) === "passed";
}

function sumBy(records, field) {
  return records.reduce((sum, record) => sum + Number((record.metrics && record.metrics[field]) || 0), 0);
}

function achievedByRunningTotal(records, field, targetValue) {
  let total = 0;
  for (const record of sortRecords(records)) {
    total += Number((record.metrics && record.metrics[field]) || 0);
    if (total >= targetValue) {
      return record.sportDate;
    }
  }
  return null;
}

function groupRecordsBySportDate(records) {
  const byDate = new Map();
  for (const record of records) {
    if (!byDate.has(record.sportDate)) {
      byDate.set(record.sportDate, []);
    }
    byDate.get(record.sportDate).push(record);
  }
  return byDate;
}

function calculateExerciseDays(records, goal) {
  const byDate = groupRecordsBySportDate(records);
  const qualifiedDates = [];

  for (const [sportDate, dayRecords] of byDate.entries()) {
    const calories = sumBy(dayRecords, "calories");
    if (calories >= goal.minKcalPerDay) {
      qualifiedDates.push(sportDate);
    }
  }

  qualifiedDates.sort();
  return {
    doneValue: qualifiedDates.length,
    achievedAt: qualifiedDates.length >= goal.targetDays ? qualifiedDates[goal.targetDays - 1] : null
  };
}

function calculateExerciseTimes(records, goal) {
  const qualifiedRecords = sortRecords(records).filter((record) => Number((record.metrics && record.metrics.calories) || 0) >= goal.minKcalPerTime);
  return {
    doneValue: qualifiedRecords.length,
    achievedAt: qualifiedRecords.length >= goal.targetTimes ? qualifiedRecords[goal.targetTimes - 1].sportDate : null
  };
}

function calculateRingClosedDays(records, goal) {
  const dates = Array.from(new Set(records
    .filter((record) => record.metrics && record.metrics.ringClosed === true)
    .map((record) => record.sportDate)))
    .sort();

  return {
    doneValue: dates.length,
    achievedAt: dates.length >= goal.targetDays ? dates[goal.targetDays - 1] : null
  };
}

function calculateGoalProgress(goalType, goal, records) {
  if (goalType === "calorieTotal") {
    const targetValue = Number(goal.targetKcal || 0);
    const doneValue = sumBy(records, "calories");
    return { goalType, doneValue: round2(doneValue), targetValue, progress: percent(doneValue, targetValue), achievedAt: achievedByRunningTotal(records, "calories", targetValue) };
  }
  if (goalType === "durationTotal") {
    const targetValue = Number(goal.targetMinutes || 0);
    const doneValue = sumBy(records, "durationMinutes");
    return { goalType, doneValue: round2(doneValue), targetValue, progress: percent(doneValue, targetValue), achievedAt: achievedByRunningTotal(records, "durationMinutes", targetValue) };
  }
  if (goalType === "exerciseDays") {
    const targetValue = Number(goal.targetDays || 0);
    const result = calculateExerciseDays(records, goal);
    return { goalType, doneValue: result.doneValue, targetValue, progress: percent(result.doneValue, targetValue), achievedAt: result.achievedAt };
  }
  if (goalType === "exerciseTimes") {
    const targetValue = Number(goal.targetTimes || 0);
    const result = calculateExerciseTimes(records, goal);
    return { goalType, doneValue: result.doneValue, targetValue, progress: percent(result.doneValue, targetValue), achievedAt: result.achievedAt };
  }
  if (goalType === "runningDistance") {
    const targetValue = Number(goal.targetKm || 0);
    const doneValue = sumBy(records, "runningDistanceKm");
    return { goalType, doneValue: round2(doneValue), targetValue, progress: percent(doneValue, targetValue), achievedAt: achievedByRunningTotal(records, "runningDistanceKm", targetValue) };
  }
  if (goalType === "cyclingDistance") {
    const targetValue = Number(goal.targetKm || 0);
    const doneValue = sumBy(records, "cyclingDistanceKm");
    return { goalType, doneValue: round2(doneValue), targetValue, progress: percent(doneValue, targetValue), achievedAt: achievedByRunningTotal(records, "cyclingDistanceKm", targetValue) };
  }
  if (goalType === "ringClosedDays") {
    const targetValue = Number(goal.targetDays || 0);
    const result = calculateRingClosedDays(records, goal);
    return { goalType, doneValue: result.doneValue, targetValue, progress: percent(result.doneValue, targetValue), achievedAt: result.achievedAt };
  }
  return { goalType, doneValue: 0, targetValue: 0, progress: 0, achievedAt: null };
}

function createTargetSummary(targetConfig) {
  return {
    targetConfigId: targetConfig ? targetConfig._id : "",
    status: targetConfig ? targetConfig.status || "unset" : "unset",
    selectedGoalCount: targetConfig && Array.isArray(targetConfig.selectedGoalTypes) ? targetConfig.selectedGoalTypes.length : 0,
    coinValue: targetConfig ? Number(targetConfig.coinValue || 0) : 0
  };
}

function createRecordSummary(records) {
  const effectiveRecords = records.filter((record) => EFFECTIVE_RECORD_STATUSES.has(record.status));
  const lastSportDate = effectiveRecords.map((record) => record.sportDate).filter(Boolean).sort().pop() || null;
  const todayKey = formatDateKey();
  return {
    validRecordCount: effectiveRecords.length,
    todayChecked: effectiveRecords.some((record) => record.sportDate === todayKey),
    lastSportDate
  };
}

function calculateMemberStats({ group, membership, targetConfig, records }) {
  const eligibleRecords = records.filter((record) => isEligibleRecord(record, membership, targetConfig, group));
  const targetSummary = createTargetSummary(targetConfig);

  if (!isTargetConfigured(targetConfig)) {
    return {
      membershipId: membership._id,
      userId: membership.userId,
      nickname: membership.nickname,
      role: membership.role,
      activePeriodSeq: membership.activePeriodSeq || 1,
      targetStatus: targetSummary.status,
      coinValue: targetSummary.coinValue,
      targetSummary,
      recordSummary: createRecordSummary(eligibleRecords),
      targetProgressList: [],
      overallProgress: null,
      progressText: "targetUnset",
      completed: false,
      completedAt: null,
      incompleteSummary: "targetUnset"
    };
  }

  const targetProgressList = targetConfig.selectedGoalTypes.map((goalType) => calculateGoalProgress(
    goalType,
    targetConfig.goals[goalType] || {},
    eligibleRecords
  ));
  const overallProgress = round2(targetProgressList.reduce((sum, item) => sum + item.progress, 0) / targetProgressList.length);
  const completed = targetProgressList.every((item) => item.progress >= 100);
  const completedAt = completed
    ? targetProgressList.map((item) => item.achievedAt).filter(Boolean).sort().pop() || null
    : null;
  const incompleteGoalTypes = targetProgressList.filter((item) => item.progress < 100).map((item) => item.goalType);

  return {
    membershipId: membership._id,
    userId: membership.userId,
    nickname: membership.nickname,
    role: membership.role,
    activePeriodSeq: membership.activePeriodSeq || 1,
    targetStatus: targetConfig.status,
    coinValue: Number(targetConfig.coinValue || 0),
    targetSummary,
    recordSummary: createRecordSummary(eligibleRecords),
    targetProgressList,
    overallProgress,
    progressText: completed ? "completed" : "inProgress",
    completed,
    completedAt,
    incompleteSummary: incompleteGoalTypes.join(",")
  };
}

function calculateGroupStats({ group, activeMemberships, targetConfigs, records }) {
  const targetByMembershipId = new Map(targetConfigs.map((targetConfig) => [targetConfig.membershipId, targetConfig]));
  const recordsByMembershipId = new Map();

  for (const record of records) {
    if (!recordsByMembershipId.has(record.membershipId)) {
      recordsByMembershipId.set(record.membershipId, []);
    }
    recordsByMembershipId.get(record.membershipId).push(record);
  }

  const members = activeMemberships.map((membership) => calculateMemberStats({
    group,
    membership,
    targetConfig: targetByMembershipId.get(membership._id),
    records: recordsByMembershipId.get(membership._id) || []
  }));
  const activeMemberCount = activeMemberships.length;
  const completedMemberCount = members.filter((member) => member.completed).length;
  const incompleteMemberCount = activeMemberCount - completedMemberCount;
  const groupCompletionRate = activeMemberCount > 0 ? Math.round((completedMemberCount / activeMemberCount) * 100) : null;

  return {
    members,
    groupSummary: {
      activeMemberCount,
      completedMemberCount,
      incompleteMemberCount,
      groupCompletionRate,
      groupCompletionText: activeMemberCount > 0 ? "ready" : "noActiveMember"
    }
  };
}

function createEmptyStatsResult() {
  return {
    members: [],
    groupSummary: {
      activeMemberCount: 0,
      completedMemberCount: 0,
      incompleteMemberCount: 0,
      groupCompletionRate: null,
      groupCompletionText: "noActiveMember"
    }
  };
}

module.exports = {
  calculateGroupStats,
  calculateMemberStats,
  createEmptyStatsResult,
  getContentReviewStatus,
  isEligibleRecord,
  isRecordContextEligible
};
