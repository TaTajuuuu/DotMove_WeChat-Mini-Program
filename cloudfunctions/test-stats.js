/**
 * 统计计算函数单元测试
 * 测试 common/stats.js 的核心逻辑
 */

// 导入要测试的函数
const stats = require('./yidianApi/common/stats.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// 测试用例 1: 运动天数目标计算
function testExerciseDays() {
  console.log('=== 测试 1: 运动天数目标计算 ===');

  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = {
    _id: 'm1',
    userId: 'u1',
    nickname: '测试用户',
    role: 'member',
    status: 'active',
    activePeriodSeq: 1
  };

  const targetConfig = {
    status: 'locked',
    selectedGoalTypes: ['exerciseDays'],
    goals: {
      exerciseDays: { targetDays: 5, minKcalPerDay: 300 }
    }
  };

  // 场景 1: 3 天达标（每天累计热量 >= 300），未达到 5 天目标
  const records1 = [
    { sportDate: '2026-06-01', metrics: { calories: 350 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-01', metrics: { calories: 200 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 }, // 同一天累计 550
    { sportDate: '2026-06-02', metrics: { calories: 300 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-03', metrics: { calories: 400 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-05', metrics: { calories: 200 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 }, // 未达标
  ];

  const result1 = stats.calculateMemberStats({ group, membership, targetConfig, records: records1 });
  console.log('场景 1 - 3 天达标:', JSON.stringify(result1.targetProgressList, null, 2));
  assert(result1.targetProgressList[0].doneValue === 3, '应该计算为 3 天');
  assert(result1.targetProgressList[0].achievedAt === null, '未达到 5 天目标时完成日期应该为空');

  // 场景 2: 刚好达到 5 天目标，完成日期应为第 5 个达标日
  const records2 = records1.concat([
    { sportDate: '2026-06-06', metrics: { calories: 350 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-07', metrics: { calories: 320 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
  ]);
  const result2 = stats.calculateMemberStats({ group, membership, targetConfig, records: records2 });
  assert(result2.targetProgressList[0].doneValue === 5, '应该计算为 5 天');
  assert(result2.targetProgressList[0].achievedAt === '2026-06-07', '完成日期应该是第 5 个达标日 2026-06-07');

  console.log('✅ 测试 1 通过\n');
}

// 测试用例 2: 运动次数目标计算
function testExerciseTimes() {
  console.log('=== 测试 2: 运动次数目标计算 ===');

  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = {
    _id: 'm1',
    userId: 'u1',
    nickname: '测试用户',
    role: 'member',
    status: 'active',
    activePeriodSeq: 1
  };

  const targetConfig = {
    status: 'locked',
    selectedGoalTypes: ['exerciseTimes'],
    goals: {
      exerciseTimes: { targetTimes: 5, minKcalPerTime: 300 }
    }
  };

  // 场景 1: 3 次达标（单条记录热量 >= 300），未达到 5 次目标
  const records1 = [
    { sportDate: '2026-06-01', metrics: { calories: 350 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-01', metrics: { calories: 200 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 }, // 同一天未达标
    { sportDate: '2026-06-02', metrics: { calories: 300 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-03', metrics: { calories: 400 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-05', metrics: { calories: 200 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 }, // 未达标
  ];

  const result1 = stats.calculateMemberStats({ group, membership, targetConfig, records: records1 });
  console.log('场景 1 - 3 次达标:', JSON.stringify(result1.targetProgressList, null, 2));
  assert(result1.targetProgressList[0].doneValue === 3, '应该计算为 3 次');
  assert(result1.targetProgressList[0].achievedAt === null, '未达到 5 次目标时完成日期应该为空');

  const records2 = records1.concat([
    { sportDate: '2026-06-06', metrics: { calories: 350 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-07', metrics: { calories: 320 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
  ]);
  const result2 = stats.calculateMemberStats({ group, membership, targetConfig, records: records2 });
  assert(result2.targetProgressList[0].doneValue === 5, '应该计算为 5 次');
  assert(result2.targetProgressList[0].achievedAt === '2026-06-07', '完成日期应该是第 5 条达标记录 2026-06-07');

  console.log('✅ 测试 2 通过\n');
}

// 测试用例 3: 三环闭合天数目标计算
function testRingClosedDays() {
  console.log('=== 测试 3: 三环闭合天数目标计算 ===');

  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = {
    _id: 'm1',
    userId: 'u1',
    nickname: '测试用户',
    role: 'member',
    status: 'active',
    activePeriodSeq: 1
  };

  const targetConfig = {
    status: 'locked',
    selectedGoalTypes: ['ringClosedDays'],
    goals: {
      ringClosedDays: { targetDays: 5 }
    }
  };

  // 场景 1: 3 天三环闭合（按日期去重）
  const records1 = [
    { sportDate: '2026-06-01', metrics: { ringClosed: true }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-01', metrics: { ringClosed: true }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 }, // 同一天重复，只计 1 天
    { sportDate: '2026-06-02', metrics: { ringClosed: true }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-03', metrics: { ringClosed: false }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 }, // 未闭合
    { sportDate: '2026-06-04', metrics: { ringClosed: true }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
  ];

  const result1 = stats.calculateMemberStats({ group, membership, targetConfig, records: records1 });
  console.log('场景 1 - 3 天三环闭合:', JSON.stringify(result1.targetProgressList, null, 2));
  assert(result1.targetProgressList[0].doneValue === 3, '应该计算为 3 天（去重后）');

  console.log('✅ 测试 3 通过\n');
}

// 测试用例 4: 单项目标进度最高 100%
function testGoalProgressMax100() {
  console.log('=== 测试 4: 单项目标进度最高 100% ===');

  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = {
    _id: 'm1',
    userId: 'u1',
    nickname: '测试用户',
    role: 'member',
    status: 'active',
    activePeriodSeq: 1
  };

  const targetConfig = {
    status: 'locked',
    selectedGoalTypes: ['calorieTotal'],
    goals: {
      calorieTotal: { targetKcal: 1000 }
    }
  };

  // 场景: 完成值超过目标值
  const records = [
    { sportDate: '2026-06-01', metrics: { calories: 1500 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
  ];

  const result = stats.calculateMemberStats({ group, membership, targetConfig, records });
  console.log('场景 - 完成值超过目标值:', JSON.stringify(result.targetProgressList, null, 2));
  assert(result.targetProgressList[0].progress === 100, '进度应该最高为 100%');
  assert(result.targetProgressList[0].doneValue === 1500, '完成值应该是 1500');

  console.log('✅ 测试 4 通过\n');
}

// 测试用例 5: 个人综合进度为已设置目标平均值
function testOverallProgress() {
  console.log('=== 测试 5: 个人综合进度为已设置目标平均值 ===');

  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = {
    _id: 'm1',
    userId: 'u1',
    nickname: '测试用户',
    role: 'member',
    status: 'active',
    activePeriodSeq: 1
  };

  const targetConfig = {
    status: 'locked',
    selectedGoalTypes: ['calorieTotal', 'exerciseDays'],
    goals: {
      calorieTotal: { targetKcal: 1000 },
      exerciseDays: { targetDays: 5, minKcalPerDay: 300 }
    }
  };

  const records = [
    { sportDate: '2026-06-01', metrics: { calories: 500 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-02', metrics: { calories: 600 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
  ];

  const result = stats.calculateMemberStats({ group, membership, targetConfig, records });
  console.log('个人综合进度:', JSON.stringify(result, null, 2));
  assert(result.overallProgress !== null, '应该有综合进度');
  assert(result.targetProgressList.length === 2, '应该有 2 个目标进度');

  console.log('✅ 测试 5 通过\n');
}

// 测试用例 6: 未设置目标显示 "targetUnset"
function testUnsetTarget() {
  console.log('=== 测试 6: 未设置目标显示 targetUnset ===');

  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = {
    _id: 'm1',
    userId: 'u1',
    nickname: '测试用户',
    role: 'member',
    status: 'active',
    activePeriodSeq: 1
  };

  const targetConfig = null; // 未设置目标
  const records = [];

  const result = stats.calculateMemberStats({ group, membership, targetConfig, records });
  console.log('未设置目标:', JSON.stringify(result, null, 2));
  assert(result.progressText === 'targetUnset', '应该显示 targetUnset');
  assert(result.overallProgress === null, '综合进度应该为 null');

  console.log('✅ 测试 6 通过\n');
}

// 测试用例 7: 退出重入统计资格
function testExitedRejoinEligibility() {
  console.log('=== 测试 7: 退出重入统计资格 ===');

  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = {
    _id: 'm1',
    userId: 'u1',
    nickname: '测试用户',
    role: 'member',
    status: 'active',
    activePeriodSeq: 2 // 重新加入后 activePeriodSeq = 2
  };

  const targetConfig = {
    status: 'locked',
    selectedGoalTypes: ['calorieTotal'],
    goals: {
      calorieTotal: { targetKcal: 1000 }
    }
  };

  // 场景 1: 记录属于退出前（activePeriodSeq = 1），不应进入当前统计
  const records1 = [
    { sportDate: '2026-06-01', metrics: { calories: 500 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
  ];

  const result1 = stats.calculateMemberStats({ group, membership, targetConfig, records: records1 });
  console.log('场景 1 - 退出前记录:', JSON.stringify(result1.targetProgressList, null, 2));
  assert(result1.targetProgressList[0].doneValue === 0, '退出前记录不应进入当前统计');

  // 场景 2: 记录属于重新加入后（activePeriodSeq = 2），应进入当前统计
  const records2 = [
    { sportDate: '2026-06-10', metrics: { calories: 500 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 2 },
  ];

  const result2 = stats.calculateMemberStats({ group, membership, targetConfig, records: records2 });
  console.log('场景 2 - 重新加入后记录:', JSON.stringify(result2.targetProgressList, null, 2));
  assert(result2.targetProgressList[0].doneValue === 500, '重新加入后记录应进入当前统计');

  console.log('✅ 测试 7 通过\n');
}

// 测试用例 8: 小组整体完成率计算
function testGroupCompletionRate() {
  console.log('=== 测试 8: 小组整体完成率计算 ===');

  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };

  const activeMemberships = [
    { _id: 'm1', userId: 'u1', nickname: '用户1', role: 'member', status: 'active', activePeriodSeq: 1 },
    { _id: 'm2', userId: 'u2', nickname: '用户2', role: 'member', status: 'active', activePeriodSeq: 1 },
    { _id: 'm3', userId: 'u3', nickname: '用户3', role: 'creator', status: 'active', activePeriodSeq: 1 },
  ];

  const targetConfigs = [
    { membershipId: 'm1', status: 'locked', selectedGoalTypes: ['calorieTotal'], goals: { calorieTotal: { targetKcal: 1000 } } },
    { membershipId: 'm2', status: 'locked', selectedGoalTypes: ['calorieTotal'], goals: { calorieTotal: { targetKcal: 1000 } } },
    { membershipId: 'm3', status: 'locked', selectedGoalTypes: ['calorieTotal'], goals: { calorieTotal: { targetKcal: 1000 } } },
  ];

  // 场景: m1 和 m2 完成，m3 未完成
  const records = [
    { sportDate: '2026-06-01', metrics: { calories: 1200 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-01', metrics: { calories: 1500 }, status: 'valid', membershipId: 'm2', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
    { sportDate: '2026-06-01', metrics: { calories: 500 }, status: 'valid', membershipId: 'm3', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 1 },
  ];

  const result = stats.calculateGroupStats({ group, activeMemberships, targetConfigs, records });
  console.log('小组整体完成率:', JSON.stringify(result.groupSummary, null, 2));
  assert(result.groupSummary.completedMemberCount === 2, '应该有 2 个成员完成');
  assert(result.groupSummary.groupCompletionRate === 67, '完成率应该是 67%');

  console.log('✅ 测试 8 通过\n');
}

// 测试用例 9: 小组整体完成率分母为 0 时
function testGroupCompletionRateNoMembers() {
  console.log('=== 测试 9: 小组整体完成率分母为 0 时 ===');

  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const activeMemberships = [];
  const targetConfigs = [];
  const records = [];

  const result = stats.calculateGroupStats({ group, activeMemberships, targetConfigs, records });
  console.log('无有效成员:', JSON.stringify(result.groupSummary, null, 2));
  assert(result.groupSummary.groupCompletionRate === null, '完成率应该为 null');
  assert(result.groupSummary.groupCompletionText === 'noActiveMember', '应该显示 noActiveMember');

  console.log('✅ 测试 9 通过\n');
}

// 运行所有测试
console.log('开始运行统计计算函数单元测试...\n');

try {
  testExerciseDays();
  testExerciseTimes();
  testRingClosedDays();
  testGoalProgressMax100();
  testOverallProgress();
  testUnsetTarget();
  testExitedRejoinEligibility();
  testGroupCompletionRate();
  testGroupCompletionRateNoMembers();

  console.log('🎉 所有测试通过！T16 统计计算功能实现正确。');
} catch (error) {
  console.error('❌ 测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
}
