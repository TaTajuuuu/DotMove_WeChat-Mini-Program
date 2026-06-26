// 测试数据初始化脚本
// 用途：在云开发控制台手动执行，创建 T16-T18 测试所需的全部数据
// 执行方式：在云开发控制台 → 数据库 → 创建集合和记录

const testData = {
  // 测试用户
  users: [
    {
      _id: "test_user_001",
      nickname: "测试用户A（创建者）",
      avatarUrl: "",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    },
    {
      _id: "test_user_002",
      nickname: "测试用户B",
      avatarUrl: "",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    },
    {
      _id: "test_user_003",
      nickname: "测试用户C",
      avatarUrl: "",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    }
  ],

  // 测试小组（已过期，用于测试归档）
  groups: [
    {
      _id: "test_group_001",
      name: "6月运动挑战",
      creatorId: "test_user_001",
      status: "active", // 将被归档
      inviteStatus: "enabled",
      monthKey: "2026-06",
      lifecycleStartAt: new Date("2026-06-01T00:00:00.000Z"),
      lifecycleEndAt: new Date("2026-06-25T23:59:59.000Z"), // 已过期
      archivedAt: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    }
  ],

  // 成员关系
  memberships: [
    {
      _id: "test_membership_001",
      groupId: "test_group_001",
      userId: "test_user_001",
      nickname: "用户A",
      role: "creator",
      status: "active",
      joinedAt: new Date("2026-06-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    },
    {
      _id: "test_membership_002",
      groupId: "test_group_001",
      userId: "test_user_002",
      nickname: "用户B",
      role: "member",
      status: "active",
      joinedAt: new Date("2026-06-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    },
    {
      _id: "test_membership_003",
      groupId: "test_group_001",
      userId: "test_user_003",
      nickname: "用户C",
      role: "member",
      status: "active",
      joinedAt: new Date("2026-06-05T00:00:00.000Z"), // 晚几天加入
      createdAt: new Date("2026-06-05T00:00:00.000Z"),
      updatedAt: new Date("2026-06-05T00:00:00.000Z")
    }
  ],

  // 目标配置（用户A设置目标，用户B未设置，用户C设置目标）
  targetConfigs: [
    {
      _id: "test_target_001",
      groupId: "test_group_001",
      membershipId: "test_membership_001",
      userId: "test_user_001",
      monthKey: "2026-06",
      status: "set", // 归档时会被锁定为 locked
      selectedGoalTypes: ["exerciseDays", "calorieTotal"],
      goals: {
        exerciseDays: 20, // 运动20天
        calorieTotal: 6000 // 总消耗6000卡路里
      },
      coinValue: 1,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    },
    {
      _id: "test_target_003",
      groupId: "test_group_001",
      membershipId: "test_membership_003",
      userId: "test_user_003",
      monthKey: "2026-06",
      status: "set",
      selectedGoalTypes: ["exerciseTimes"],
      goals: {
        exerciseTimes: 30 // 运动30次
      },
      coinValue: 1,
      createdAt: new Date("2026-06-05T00:00:00.000Z"),
      updatedAt: new Date("2026-06-05T00:00:00.000Z")
    }
  ],

  // 打卡记录（用户A完成20天，用户B完成10天，用户C完成30次）
  checkinRecords: []
};

// 生成打卡记录
// 用户A：6月1日-6月20日每天打卡（完成 exerciseDays=20 目标）
for (let day = 1; day <= 20; day++) {
  testData.checkinRecords.push({
    _id: `test_checkin_A_${day}`,
    groupId: "test_group_001",
    membershipId: "test_membership_001",
    userId: "test_user_001",
    monthKey: "2026-06",
    sportDate: `2026-06-${day.toString().padStart(2, '0')}`,
    metrics: {
      exerciseDays: 1,
      calorieTotal: 300, // 每天消耗300卡
      exerciseTimes: 1
    },
    photos: [],
    remark: "",
    status: "valid",
    createdAt: new Date(`2026-06-${day.toString().padStart(2, '0')}T08:00:00.000Z`),
    updatedAt: new Date(`2026-06-${day.toString().padStart(2, '0')}T08:00:00.000Z`)
  });
}

// 用户B：6月1日-6月10日每天打卡（未完成目标，未设置目标）
for (let day = 1; day <= 10; day++) {
  testData.checkinRecords.push({
    _id: `test_checkin_B_${day}`,
    groupId: "test_group_001",
    membershipId: "test_membership_002",
    userId: "test_user_002",
    monthKey: "2026-06",
    sportDate: `2026-06-${day.toString().padStart(2, '0')}`,
    metrics: {
      exerciseDays: 1,
      calorieTotal: 200,
      exerciseTimes: 1
    },
    photos: [],
    remark: "",
    status: "valid",
    createdAt: new Date(`2026-06-${day.toString().padStart(2, '0')}T09:00:00.000Z`),
    updatedAt: new Date(`2026-06-${day.toString().padStart(2, '0')}T09:00:00.000Z`)
  });
}

// 用户C：6月5日-7月4日每2天打卡一次（完成 exerciseTimes=30 目标）
for (let i = 0; i < 30; i++) {
  const date = new Date("2026-06-05");
  date.setDate(date.getDate() + i * 2);
  const dateStr = date.toISOString().split('T')[0];

  testData.checkinRecords.push({
    _id: `test_checkin_C_${i + 1}`,
    groupId: "test_group_001",
    membershipId: "test_membership_003",
    userId: "test_user_003",
    monthKey: "2026-06",
    sportDate: dateStr,
    metrics: {
      exerciseTimes: 1,
      calorieTotal: 250
    },
    photos: [],
    remark: "",
    status: "valid",
    createdAt: new Date(date.getTime() + 10 * 60 * 60 * 1000),
    updatedAt: new Date(date.getTime() + 10 * 60 * 60 * 1000)
  });
}

console.log("测试数据生成完成！");
console.log("- 用户数:", testData.users.length);
console.log("- 小组数:", testData.groups.length);
console.log("- 成员数:", testData.memberships.length);
console.log("- 目标配置数:", testData.targetConfigs.length);
console.log("- 打卡记录数:", testData.checkinRecords.length);

// 导出为 JSON 文件（用于在云开发控制台手动导入）
module.exports = testData;
