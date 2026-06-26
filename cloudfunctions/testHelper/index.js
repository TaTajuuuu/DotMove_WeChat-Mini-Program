const cloud = require('wx-server-sdk');
const { ok, fail } = require('../yidianApi/common/response');
const { ErrorCodes } = require('../yidianApi/common/errors');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 测试数据配置
const TEST_CONFIG = {
  userCount: 3,
  groupName: '自动化测试小组',
  monthKey: '2026-06',
  lifecycleStart: '2026-06-01T00:00:00.000Z',
  lifecycleEnd: '2026-06-25T23:59:59.000Z' // 已过期，用于测试归档
};

// 测试结果收集器
class TestResultCollector {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
  }

  addTest(name, passed, details = null, error = null) {
    const result = {
      name,
      passed,
      details,
      error: error ? error.message || String(error) : null,
      timestamp: new Date().toISOString()
    };
    this.results.push(result);

    if (passed === true) {
      this.passed++;
      console.log(`✅ [通过] ${name}`);
    } else if (passed === false) {
      this.failed++;
      console.log(`❌ [失败] ${name}: ${result.error}`);
    } else {
      this.skipped++;
      console.log(`⚠️ [跳过] ${name}`);
    }

    if (details) {
      console.log(`   详情:`, details);
    }
  }

  getSummary() {
    return {
      total: this.results.length,
      passed: this.passed,
      failed: this.failed,
      skipped: this.skipped,
      successRate: this.results.length > 0
        ? ((this.passed / this.results.length) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  getReport() {
    return {
      summary: this.getSummary(),
      results: this.results
    };
  }
}

module.exports = {
  async runFullTest({ payload = {}, traceId = '' }) {
    const db = cloud.database();
    const collector = new TestResultCollector();
    const testData = {
      userIds: [],
      groupId: null,
      membershipIds: [],
      targetIds: [],
      checkinIds: []
    };

    console.log('[自动化测试] 开始执行 T16-T18 测试...');
    console.log('[自动化测试] traceId:', traceId);

    try {
      // 阶段 1：创建测试数据
      console.log('\n[阶段 1] 创建测试数据...');
      await createTestData(db, testData, collector);

      // 阶段 2：测试 T16 统计计算
      console.log('\n[阶段 2] 测试 T16 统计计算...');
      await testT16(db, testData, collector);

      // 阶段 3：测试 T17 归档任务
      console.log('\n[阶段 3] 测试 T17 归档任务...');
      await testT17(db, testData, collector);

      // 阶段 4：测试 T18 归档查询
      console.log('\n[阶段 4] 测试 T18 归档查询...');
      await testT18(db, testData, collector);

      // 阶段 5：清理测试数据
      console.log('\n[阶段 5] 清理测试数据...');
      await cleanupTestData(db, testData, collector);

      // 生成测试报告
      const report = collector.getReport();
      console.log('\n[测试完成] 测试结果汇总:');
      console.log(`  总数: ${report.summary.total}`);
      console.log(`  通过: ${report.summary.passed}`);
      console.log(`  失败: ${report.summary.failed}`);
      console.log(`  跳过: ${report.summary.skipped}`);
      console.log(`  成功率: ${report.summary.successRate}`);

      return ok({
        message: '测试完成',
        report
      }, { traceId });

    } catch (error) {
      console.error('[测试失败] 发生未预期的错误:', error);

      // 尝试清理测试数据
      try {
        await cleanupTestData(db, testData, collector);
      } catch (cleanupError) {
        console.error('[清理失败]', cleanupError);
      }

      return fail(
        ErrorCodes.COMMON_SYSTEM_ERROR,
        `测试执行失败: ${error.message}`,
        {
          traceId,
          error: error.message,
          report: collector.getReport()
        }
      );
    }
  }
};

// ==================== 阶段 1：创建测试数据 ====================

async function createTestData(db, testData, collector) {
  try {
    // 创建测试用户
    const users = [];
    for (let i = 1; i <= TEST_CONFIG.userCount; i++) {
      const userId = `test_auto_user_${i}_${Date.now()}`;
      await db.collection('users').add({
        data: {
          _id: userId,
          nickname: `自动测试用户${i}`,
          avatarUrl: '',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      users.push(userId);
      testData.userIds.push(userId);
    }
    collector.addTest('创建测试用户', true, { count: users.length });

    // 创建测试小组
    const groupResult = await db.collection('groups').add({
      data: {
        name: TEST_CONFIG.groupName,
        creatorId: users[0],
        status: 'active',
        inviteStatus: 'enabled',
        monthKey: TEST_CONFIG.monthKey,
        lifecycleStartAt: new Date(TEST_CONFIG.lifecycleStart),
        lifecycleEndAt: new Date(TEST_CONFIG.lifecycleEnd),
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    testData.groupId = groupResult._id;
    collector.addTest('创建测试小组', true, { groupId: testData.groupId });

    // 创建成员关系
    for (let i = 0; i < users.length; i++) {
      const membershipResult = await db.collection('memberships').add({
        data: {
          groupId: testData.groupId,
          userId: users[i],
          nickname: `测试用户${i + 1}`,
          role: i === 0 ? 'creator' : 'member',
          status: 'active',
          joinedAt: i === 0
            ? new Date(TEST_CONFIG.lifecycleStart)
            : new Date(new Date(TEST_CONFIG.lifecycleStart).getTime() + i * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      testData.membershipIds.push(membershipResult._id);
    }
    collector.addTest('创建成员关系', true, { count: testData.membershipIds.length });

    // 创建目标配置（用户1和用户3设置目标，用户2不设置）
    const targetConfigs = [
      {
        groupId: testData.groupId,
        membershipId: testData.membershipIds[0],
        userId: users[0],
        monthKey: TEST_CONFIG.monthKey,
        status: 'set',
        selectedGoalTypes: ['exerciseDays', 'calorieTotal'],
        goals: {
          exerciseDays: 20,
          calorieTotal: 6000
        },
        coinValue: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        groupId: testData.groupId,
        membershipId: testData.membershipIds[2],
        userId: users[2],
        monthKey: TEST_CONFIG.monthKey,
        status: 'set',
        selectedGoalTypes: ['exerciseTimes'],
        goals: {
          exerciseTimes: 30
        },
        coinValue: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const targetConfig of targetConfigs) {
      const result = await db.collection('targetConfigs').add({ data: targetConfig });
      testData.targetIds.push(result._id);
    }
    collector.addTest('创建目标配置', true, { count: testData.targetIds.length });

    // 创建打卡记录
    // 用户1：20条记录（完成exerciseDays=20目标）
    for (let day = 1; day <= 20; day++) {
      const date = new Date(2026, 5, day); // 2026-06-day
      const result = await db.collection('checkinRecords').add({
        data: {
          groupId: testData.groupId,
          membershipId: testData.membershipIds[0],
          userId: users[0],
          monthKey: TEST_CONFIG.monthKey,
          sportDate: formatDate(date),
          metrics: {
            exerciseDays: 1,
            calorieTotal: 300,
            exerciseTimes: 1
          },
          photos: [],
          remark: '',
          status: 'valid',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      testData.checkinIds.push(result._id);
    }

    // 用户2：10条记录（未完成目标，且未设置目标）
    for (let day = 1; day <= 10; day++) {
      const date = new Date(2026, 5, day);
      const result = await db.collection('checkinRecords').add({
        data: {
          groupId: testData.groupId,
          membershipId: testData.membershipIds[1],
          userId: users[1],
          monthKey: TEST_CONFIG.monthKey,
          sportDate: formatDate(date),
          metrics: {
            exerciseDays: 1,
            calorieTotal: 200,
            exerciseTimes: 1
          },
          photos: [],
          remark: '',
          status: 'valid',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      testData.checkinIds.push(result._id);
    }

    // 用户3：30条记录（完成exerciseTimes=30目标）
    for (let i = 0; i < 30; i++) {
      const date = new Date(2026, 5, 5);
      date.setDate(date.getDate() + i * 2);
      const result = await db.collection('checkinRecords').add({
        data: {
          groupId: testData.groupId,
          membershipId: testData.membershipIds[2],
          userId: users[2],
          monthKey: TEST_CONFIG.monthKey,
          sportDate: formatDate(date),
          metrics: {
            exerciseTimes: 1,
            calorieTotal: 250
          },
          photos: [],
          remark: '',
          status: 'valid',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      testData.checkinIds.push(result._id);
    }

    collector.addTest('创建打卡记录', true, { count: testData.checkinIds.length });

  } catch (error) {
    collector.addTest('创建测试数据', false, null, error);
    throw error;
  }
}

// ==================== 阶段 2：测试 T16 统计计算 ====================

async function testT16(db, testData, collector) {
  try {
    // 导入统计模块
    const { calculateGroupStats } = require('../yidianApi/common/stats');

    // 查询测试数据
    const group = await db.collection('groups').doc(testData.groupId).get();
    const activeMemberships = await db.collection('memberships').where({
      groupId: testData.groupId,
      status: 'active'
    }).get();
    const targetConfigs = await db.collection('targetConfigs').where({
      groupId: testData.groupId,
      monthKey: TEST_CONFIG.monthKey
    }).get();
    const records = await db.collection('checkinRecords').where({
      groupId: testData.groupId,
      monthKey: TEST_CONFIG.monthKey
    }).get();

    // 计算统计
    const stats = calculateGroupStats({
      group: group.data,
      activeMemberships: activeMemberships.data,
      targetConfigs: targetConfigs.data,
      records: records.data
    });

    // 验证统计结果
    console.log('[T16] 统计结果:', JSON.stringify(stats, null, 2));

    // 测试 1：activeMemberCount 应为 3
    collector.addTest(
      'T16-统计-activeMemberCount',
      stats.groupSummary.activeMemberCount === 3,
      { expected: 3, actual: stats.groupSummary.activeMemberCount }
    );

    // 测试 2：用户1的exerciseDays进度应为100%（20/20）
    const user1Stats = stats.members.find(m => m.userId === testData.userIds[0]);
    if (user1Stats) {
      const exerciseDaysProgress = user1Stats.targetProgressList.find(p => p.goalType === 'exerciseDays');
      collector.addTest(
        'T16-统计-用户1运动天数进度',
        exerciseDaysProgress && exerciseDaysProgress.progress === 100,
        { progress: exerciseDaysProgress ? exerciseDaysProgress.progress : null }
      );

      // 测试 3：用户1应标记为已完成
      collector.addTest(
        'T16-统计-用户1完成状态',
        user1Stats.completed === true,
        { completed: user1Stats.completed }
      );
    } else {
      collector.addTest('T16-统计-用户1数据存在', false, null, '用户1的统计数据进行找');
    }

    // 测试 4：用户2应显示targetUnset
    const user2Stats = stats.members.find(m => m.userId === testData.userIds[1]);
    if (user2Stats) {
      collector.addTest(
        'T16-统计-用户2未设置目标',
        user2Stats.targetUnset === true,
        { targetUnset: user2Stats.targetUnset }
      );
    } else {
      collector.addTest('T16-统计-用户2数据存在', false, null, '用户2的统计数据未找到');
    }

    // 测试 5：小组整体完成率应大于0
    collector.addTest(
      'T16-统计-小组完成率',
      stats.groupSummary.groupCompletionRate !== null && stats.groupSummary.groupCompletionRate >= 0,
      { completionRate: stats.groupSummary.groupCompletionRate }
    );

  } catch (error) {
    collector.addTest('T16-统计计算', false, null, error);
  }
}

// ==================== 阶段 3：测试 T17 归档任务 ====================

async function testT17(db, testData, collector) {
  try {
    // 导入 systemJob 模块
    const systemJob = require('../yidianApi/domains/systemJob');

    // 执行归档
    const archiveResult = await systemJob.archiveExpiredGroups({
      payload: {},
      event: {},
      context: {},
      cloud,
      traceId: `test_${Date.now()}`
    });

    console.log('[T17] 归档结果:', JSON.stringify(archiveResult, null, 2));

    // 测试 6：归档数量应为 1
    collector.addTest(
      'T17-归档-归档数量',
      archiveResult.archivedCount === 1,
      { archivedCount: archiveResult.archivedCount }
    );

    // 测试 7：验证小组状态
    const group = await db.collection('groups').doc(testData.groupId).get();
    collector.addTest(
      'T17-归档-小组状态',
      group.data.status === 'archived' && group.data.archivedAt !== null,
      { status: group.data.status, archivedAt: group.data.archivedAt }
    );

    // 测试 8：验证归档快照
    const snapshots = await db.collection('archiveSnapshots').where({
      groupId: testData.groupId
    }).get();
    collector.addTest(
      'T17-归档-归档快照',
      snapshots.data.length === 1,
      { count: snapshots.data.length }
    );

    if (snapshots.data.length > 0) {
      const snapshot = snapshots.data[0];
      testData.archiveSnapshotId = snapshot._id;

      // 测试 9：验证快照数据
      collector.addTest(
        'T17-归档-快照数据',
        snapshot.visibleUserIds && snapshot.visibleUserIds.length === 3,
        { visibleUserCount: snapshot.visibleUserIds ? snapshot.visibleUserIds.length : 0 }
      );
    }

    // 测试 10：验证成员归档快照
    const memberSnapshots = await db.collection('archiveMemberSnapshots').where({
      groupId: testData.groupId
    }).get();
    collector.addTest(
      'T17-归档-成员快照',
      memberSnapshots.data.length === 3,
      { count: memberSnapshots.data.length }
    );

    // 测试 11：验证目标配置锁定
    const targets = await db.collection('targetConfigs').where({
      groupId: testData.groupId
    }).get();
    const allLocked = targets.data.every(t => t.status === 'locked');
    collector.addTest(
      'T17-归档-目标锁定',
      allLocked,
      { targetStatuses: targets.data.map(t => t.status) }
    );

    // 测试 12：验证审计日志
    const auditLogs = await db.collection('auditLogs').where({
      actionType: 'GROUP_ARCHIVE',
      targetId: testData.groupId
    }).get();
    collector.addTest(
      'T17-归档-审计日志',
      auditLogs.data.length >= 1,
      { count: auditLogs.data.length }
    );

    // 测试 13：幂等保护（再次归档）
    const archiveResult2 = await systemJob.archiveExpiredGroups({
      payload: {},
      event: {},
      context: {},
      cloud,
      traceId: `test_${Date.now()}`
    });

    collector.addTest(
      'T17-归档-幂等保护',
      archiveResult2.skippedCount === 1,
      { skippedCount: archiveResult2.skippedCount }
    );

  } catch (error) {
    collector.addTest('T17-归档任务', false, null, error);
  }
}

// ==================== 阶段 4：测试 T18 归档查询 ====================

async function testT18(db, testData, collector) {
  try {
    // 导入 review 模块
    const review = require('../yidianApi/domains/review');

    // 测试 14：回顾首页
    const reviewHomeResult = await review.getReviewHome({
      payload: { userId: testData.userIds[0] },
      event: {},
      context: {},
      cloud,
      traceId: `test_${Date.now()}`
    });

    console.log('[T18] 回顾首页结果:', JSON.stringify(reviewHomeResult, null, 2));

    collector.addTest(
      'T18-查询-回顾首页',
      reviewHomeResult && reviewHomeResult.archives && reviewHomeResult.archives.length >= 1,
      { archiveCount: reviewHomeResult && reviewHomeResult.archives ? reviewHomeResult.archives.length : 0 }
    );

    // 测试 15：归档复盘详情
    if (testData.archiveSnapshotId) {
      const reviewDetailResult = await review.getArchiveReviewDetail({
        payload: { archiveSnapshotId: testData.archiveSnapshotId },
        event: {},
        context: {},
        cloud,
        traceId: `test_${Date.now()}`
      });

      collector.addTest(
        'T18-查询-复盘详情',
        reviewDetailResult && reviewDetailResult.archiveSnapshot,
        { hasData: !!reviewDetailResult }
      );
    } else {
      collector.addTest('T18-查询-复盘详情', null, null, 'archiveSnapshotId 未设置');
    }

    // 测试 16：权限校验（用未授权用户）
    try {
      await review.getArchiveReviewDetail({
        payload: { archiveSnapshotId: testData.archiveSnapshotId },
        event: {
          // 模拟未授权用户
          user: { userId: 'unauthorized_user' }
        },
        context: {},
        cloud,
        traceId: `test_${Date.now()}`
      });
      collector.addTest('T18-查询-权限校验', false, null, '应该抛出权限错误');
    } catch (error) {
      collector.addTest(
        'T18-查询-权限校验',
        error.message && error.message.includes('无权'),
        { errorMessage: error.message }
      );
    }

  } catch (error) {
    collector.addTest('T18-归档查询', false, null, error);
  }
}

// ==================== 阶段 5：清理测试数据 ====================

async function cleanupTestData(db, testData, collector) {
  try {
    // 删除打卡记录
    if (testData.checkinIds.length > 0) {
      for (const id of testData.checkinIds) {
        await db.collection('checkinRecords').doc(id).remove();
      }
      collector.addTest('清理-打卡记录', true, { count: testData.checkinIds.length });
    }

    // 删除成员归档快照
    if (testData.archiveSnapshotId) {
      const memberSnapshots = await db.collection('archiveMemberSnapshots').where({
        archiveSnapshotId: testData.archiveSnapshotId
      }).get();
      for (const snapshot of memberSnapshots.data) {
        await db.collection('archiveMemberSnapshots').doc(snapshot._id).remove();
      }
      collector.addTest('清理-成员归档快照', true, { count: memberSnapshots.data.length });
    }

    // 删除归档快照
    if (testData.archiveSnapshotId) {
      await db.collection('archiveSnapshots').doc(testData.archiveSnapshotId).remove();
      collector.addTest('清理-归档快照', true);
    }

    // 删除目标配置
    if (testData.targetIds.length > 0) {
      for (const id of testData.targetIds) {
        await db.collection('targetConfigs').doc(id).remove();
      }
      collector.addTest('清理-目标配置', true, { count: testData.targetIds.length });
    }

    // 删除成员关系
    if (testData.membershipIds.length > 0) {
      for (const id of testData.membershipIds) {
        await db.collection('memberships').doc(id).remove();
      }
      collector.addTest('清理-成员关系', true, { count: testData.membershipIds.length });
    }

    // 删除小组
    if (testData.groupId) {
      await db.collection('groups').doc(testData.groupId).remove();
      collector.addTest('清理-小组', true);
    }

    // 删除用户
    if (testData.userIds.length > 0) {
      for (const id of testData.userIds) {
        await db.collection('users').doc(id).remove();
      }
      collector.addTest('清理-用户', true, { count: testData.userIds.length });
    }

    // 删除审计日志
    const auditLogs = await db.collection('auditLogs').where({
      targetId: testData.groupId
    }).get();
    for (const log of auditLogs.data) {
      await db.collection('auditLogs').doc(log._id).remove();
    }
    collector.addTest('清理-审计日志', true, { count: auditLogs.data.length });

  } catch (error) {
    collector.addTest('清理测试数据', false, null, error);
  }
}

// ==================== 工具函数 ====================

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
