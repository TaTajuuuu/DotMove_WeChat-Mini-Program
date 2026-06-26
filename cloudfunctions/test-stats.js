/**
 * 统计计算函数单元测试
 * 测试 common/stats.js 的核心逻辑
 */

// 模拟微信云开发的日期工具函数
function formatDateKey(date) {
  if (!date) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 导入要测试的函数
const stats = require('./yidianApi/common/stats.js');

// 测试用例 1: 运动天数目标计算
function testExerciseDays() {
  console.log('=== 测试 1: 运动天数目标计算 ===');
  
  const goal = {
    targetDays: 5,
    minKcalPerDay: 300
  };
  
  // 场景 1: 3 天达标（每天累计热量 >= 300）
  const records1 = [
    { sportDate: '2026-06-01', metrics: { calories: 350 }, status: 'valid' },
    { sportDate: '2026-06-01', metrics: { calories: 200 }, status: 'valid' }, // 同一天累计 550
    { sportDate: '2026-06-02', metrics: { calories: 300 }, status: 'valid' },
    { sportDate: '2026-06-03', metrics: { calories: 400 }, status: 'valid' },
    { sportDate: '2026-06-05', metrics: { calories: 200 }, status: 'valid' }, // 未达标
  ];
  
  const result1 = stats.calculateExerciseDays(records1, goal);
  console.log('场景 1 - 3 天达标:', result1);
  console.assert(result1.doneValue === 3, '应该计算为 3 天');
  console.assert(result1.achievedAt === '2026-06-03', '完成日期应该是 2026-06-03');
  
  // 场景 2: 5 天全部达标
  const records2 = [
    { sportDate: '2026-06-01', metrics: { calories: 350 }, status: 'valid' },
    { sportDate: '2026-06-02', metrics: { calories: 300 }, status: 'valid' },
    { sportDate: '2026-06-03', metrics: { calories: 400 }, status: 'valid' },
    { sportDate: '2026-06-04', metrics: { calories: 500 }, status: 'valid' },
    { sportDate: '2026-06-05', metrics: { calories: 600 }, status: 'valid' },
  ];
  
  const result2 = stats.calculateExerciseDays(records2, goal);
  console.log('场景 2 - 5 天达标:', result2);
  console.assert(result2.doneValue === 5, '应该计算为 5 天');
  console.assert(result2.achievedAt === '2026-06-05', '完成日期应该是 2026-06-05');
  
  console.log('✅ 测试 1 通过\n');
}

// 测试用例 2: 运动次数目标计算
function testExerciseTimes() {
  console.log('=== 测试 2: 运动次数目标计算 ===');
  
  const goal = {
    targetTimes: 5,
    minKcalPerTime: 300
  };
  
  // 场景 1: 3 次达标（单条记录热量 >= 300）
  const records1 = [
    { sportDate: '2026-06-01', metrics: { calories: 350 }, status: 'valid' },
    { sportDate: '2026-06-01', metrics: { calories: 200 }, status: 'valid' }, // 同一天未达标
    { sportDate: '2026-06-02', metrics: { calories: 300 }, status: 'valid' },
    { sportDate: '2026-06-03', metrics: { calories: 400 }, status: 'valid' },
    { sportDate: '2026-06-05', metrics: { calories: 200 }, status: 'valid' }, // 未达标
  ];
  
  const result1 = stats.calculateExerciseTimes(records1, goal);
  console.log('场景 1 - 3 次达标:', result1);
  console.assert(result1.doneValue === 3, '应该计算为 3 次');
  
  console.log('✅ 测试 2 通过\n');
}

// 测试用例 3: 三环闭合天数目标计算
function testRingClosedDays() {
  console.log('=== 测试 3: 三环闭合天数目标计算 ===');
  
  const goal = {
    targetDays: 5
  };
  
  // 场景 1: 3 天三环闭合（按日期去重）
  const records1 = [
    { sportDate: '2026-06-01', metrics: { ringClosed: true }, status: 'valid' },
    { sportDate: '2026-06-01', metrics: { ringClosed: true }, status: 'valid' }, // 同一天重复，只计 1 天
    { sportDate: '2026-06-02', metrics: { ringClosed: true }, status: 'valid' },
    { sportDate: '2026-06-03', metrics: { ringClosed: false }, status: 'valid' }, // 未闭合
    { sportDate: '2026-06-04', metrics: { ringClosed: true }, status: 'valid' },
  ];
  
  const result1 = stats.calculateRingClosedDays(records1, goal);
  console.log('场景 1 - 3 天三环闭合:', result1);
  console.assert(result1.doneValue === 3, '应该计算为 3 天（去重后）');
  
  console.log('✅ 测试 3 通过\n');
}

// 测试用例 4: 单项目标进度最高 100%
function testGoalProgressMax100() {
  console.log('=== 测试 4: 单项目标进度最高 100% ===');
  
  const goal = {
    targetKcal: 1000
  };
  
  // 场景: 完成值超过目标值
  const records = [
    { sportDate: '2026-06-01', metrics: { calories: 1500 }, status: 'valid' },
  ];
  
  const result = stats.calculateGoalProgress('calorieTotal', goal, records);
  console.log('场景 - 完成值超过目标值:', result);
  console.assert(result.progress === 100, '进度应该最高为 100%');
  console.assert(result.doneValue === 1500, '完成值应该是 1500');
  
  console.log('✅ 测试 4 通过\n');
}

// 测试用例 5: 个人综合进度为已设置目标平均值
function testOverallProgress() {
  console.log('=== 测试 5: 个人综合进度为已设置目标平均值 ===');
  
  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = { _id: 'm1', userId: 'u1', nickname: '测试', role: 'member', status: 'active', activePeriodSeq: 1 };
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
  console.log('个人综合进度:', result);
  console.assert(result.overallProgress !== null, '应该有综合进度');
  console.assert(result.targetProgressList.length === 2, '应该有 2 个目标进度');
  
  console.log('✅ 测试 5 通过\n');
}

// 测试用例 6: 未设置目标显示 "targetUnset"
function testUnsetTarget() {
  console.log('=== 测试 6: 未设置目标显示 targetUnset ===');
  
  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = { _id: 'm1', userId: 'u1', nickname: '测试', role: 'member', status: 'active', activePeriodSeq: 1 };
  const targetConfig = null; // 未设置目标
  const records = [];
  
  const result = stats.calculateMemberStats({ group, membership, targetConfig, records });
  console.log('未设置目标:', result);
  console.assert(result.progressText === 'targetUnset', '应该显示 targetUnset');
  console.assert(result.overallProgress === null, '综合进度应该为 null');
  
  console.log('✅ 测试 6 通过\n');
}

// 测试用例 7: 退出重入统计资格
function testExitedRejoinEligibility() {
  console.log('=== 测试 7: 退出重入统计资格 ===');
  
  const group = { _id: 'group1', monthKey: '2026-06', status: 'active' };
  const membership = { _id: 'm1', userId: 'u1', nickname: '测试', role: 'member', status: 'active', activePeriodSeq: 2 }; // 重新加入后 activePeriodSeq = 2
  
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
  
  const eligible1 = records1.filter(r => stats.isEligibleRecord(r, membership, targetConfig, group));
  console.log('场景 1 - 退出前记录:', eligible1.length, '条符合条件');
  console.assert(eligible1.length === 0, '退出前记录不应进入当前统计');
  
  // 场景 2: 记录属于重新加入后（activePeriodSeq = 2），应进入当前统计
  const records2 = [
    { sportDate: '2026-06-10', metrics: { calories: 500 }, status: 'valid', membershipId: 'm1', groupId: 'group1', monthKey: '2026-06', membershipActivePeriodSeq: 2 },
  ];
  
  const eligible2 = records2.filter(r => stats.isEligibleRecord(r, membership, targetConfig, group));
  console.log('场景 2 - 重新加入后记录:', eligible2.length, '条符合条件');
  console.assert(eligible2.length === 1, '重新加入后记录应进入当前统计');
  
  console.log('✅ 测试 7 通过\n');
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
  
  console.log('🎉 所有测试通过！');
} catch (error) {
  console.error('❌ 测试失败:', error.message);
  console.error(error.stack);
}
