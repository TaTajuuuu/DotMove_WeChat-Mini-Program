const reviewService = require("../../../services/review");
const { PageState } = require("../../../config/page-states");

const GOAL_TYPE_MAP = {
  calorieTotal: { name: "月总最低热量", unit: "kcal" },
  durationTotal: { name: "运动时长", unit: "小时", divisor: 60 },
  exerciseDays: { name: "运动天数", unit: "天" },
  exerciseTimes: { name: "运动次数", unit: "次" },
  runningDistance: { name: "跑步距离", unit: "km" },
  cyclingDistance: { name: "骑行距离", unit: "km" },
  ringClosedDays: { name: "三环闭合", unit: "天" }
};

function buildTargetItems(progressSnapshot) {
  const list = (progressSnapshot && progressSnapshot.targetProgressList) || [];
  return list.map((item) => {
    const config = GOAL_TYPE_MAP[item.goalType] || { name: item.goalType, unit: "" };
    const divisor = config.divisor || 1;
    return {
      goalType: item.goalType,
      goalName: config.name,
      doneValue: Math.round((Number(item.doneValue || 0) / divisor) * 100) / 100,
      targetValue: Math.round((Number(item.targetValue || 0) / divisor) * 100) / 100,
      unit: config.unit,
      progress: item.progress || 0,
      achievedDate: item.achievedAt || "",
      note: item.progress >= 100 ? "已达成" : "未达成"
    };
  });
}

Page({
  data: {
    archiveSnapshotId: "",
    membershipId: "",
    memberNickname: "",
    groupName: "",
    monthLabel: "",
    coinValue: 0,
    completed: false,
    completedAt: "",
    summaryText: "",
    targetItems: [],
    pageState: PageState.LOADING,
    errorMessage: ""
  },

  onLoad(options = {}) {
    this.setData({
      archiveSnapshotId: options.archiveSnapshotId || "",
      membershipId: options.membershipId || ""
    });
    this.loadArchiveDetail();
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  async loadArchiveDetail() {
    const { archiveSnapshotId, membershipId } = this.data;

    if (!archiveSnapshotId || !membershipId) {
      this.setData({
        pageState: PageState.ERROR,
        errorMessage: "缺少归档信息。"
      });
      return;
    }

    try {
      const result = await reviewService.getArchiveMemberTargetDetail({
        archiveSnapshotId,
        membershipId
      });
      const archive = result.data.archive || {};
      const member = result.data.member || {};
      const targetConfig = member.targetConfigSnapshot || {};
      const progressSnapshot = member.progressSnapshot || {};
      const completed = Boolean(member.completed);
      const completedAt = member.completedAt || "";

      this.setData({
        pageState: PageState.READY,
        memberNickname: member.nickname || "未知成员",
        groupName: archive.groupName || "",
        monthLabel: archive.monthKey || "",
        coinValue: Number(targetConfig.coinValue || 0),
        completed,
        completedAt,
        summaryText: completed ? `已于 ${completedAt || "--"} 完成月度目标` : "未完成月度目标",
        targetItems: buildTargetItems(progressSnapshot),
        errorMessage: ""
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "加载失败。"
      });
    }
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  }
});
