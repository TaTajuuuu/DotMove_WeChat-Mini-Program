const checkinService = require("../../../services/checkin");
const groupService = require("../../../services/group");

Page({
  data: {
    groupId: "",
    groupName: "",
    monthLabel: "",
    pageState: "loading",
    errorMessage: "",
    records: [],
    filteredRecords: [],
    filterType: "all",
    filterLabel: "全部记录",
    // 云函数计算的统计（按 Spec 规则）
    stats: {
      totalCalories: 0,
      totalDuration: 0,
      totalDistance: 0,
      exerciseDays: 0,
      exerciseTimes: 0,
      ringClosedDays: 0,
      targetProgressList: []
    }
  },

  onLoad(options = {}) {
    const groupId = options.groupId || "";
    const groupName = decodeURIComponent(options.groupName || "");
    this.setData({ groupId, groupName });
    this.initMonth();
    if (groupId) {
      this.loadData(groupId);
    } else {
      this.loadActiveGroupAndRecords();
    }
  },

  onShow() {
    // 从打卡页返回后刷新数据
    if (this.data.groupId) {
      this.loadData(this.data.groupId);
    }
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  /** 初始化月份标签 */
  initMonth() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    this.setData({ monthLabel: `${y}.${m}` });
  },

  /** 获取活跃小组后加载 */
  async loadActiveGroupAndRecords() {
    try {
      const res = await groupService.getHomeEntry();
      const groups = res.data?.activeGroups || [];
      if (groups.length > 0) {
        const g = groups[0];
        this.setData({ groupId: g.groupId, groupName: g.groupName || g.name || "" });
        this.loadData(g.groupId);
      } else {
        this.setData({ pageState: "error", errorMessage: "你还没有加入任何小组。" });
      }
    } catch (e) {
      this.setData({ pageState: "error", errorMessage: "获取小组信息失败，请重试。" });
    }
  },

  /** 统一加载记录和统计 */
  async loadData(groupId) {
    this.setData({ pageState: "loading", errorMessage: "" });
    try {
      const [recordsResult, statsResult] = await Promise.all([
        checkinService.getCheckinRecords({ groupId }),
        checkinService.getMyStats({ groupId }).catch(() => ({ data: { stats: null } }))
      ]);

      const rawRecords = (recordsResult.data?.records || []).map((item) => ({
        ...item,
        displayDate: this.formatDisplayDate(item.sportDate),
        calories: (item.metrics && item.metrics.calories) || 0,
        duration: (item.metrics && item.metrics.durationMinutes) || 0,
        distance: (item.metrics && (item.metrics.runningDistanceKm || item.metrics.cyclingDistanceKm)) || 0,
        ringsClosed: !!(item.metrics && item.metrics.ringClosed),
        photoCount: (item.photos && item.photos.length) || 0
      }));

      let stats = statsResult.data?.stats;
      let displayStats = null;

      if (stats && stats.targetProgressList) {
        // 从云函数统计中提取扁平展示数据
        displayStats = this.buildDisplayStats(stats);
      } else {
        // 云函数未部署，使用本地备用计算
        displayStats = this.calcStatsFallback(rawRecords);
      }

      this.setData({
        pageState: "ready",
        records: rawRecords,
        filteredRecords: rawRecords,
        displayStats,
        stats,
        errorMessage: ""
      });
      this.applyFilter();
    } catch (error) {
      this.setData({ pageState: "error", errorMessage: error.message || "加载失败，请重试。" });
    }
  },

  /** 将云函数 stats 转为 WXML 易用的扁平结构 */
  buildDisplayStats(stats) {
    var GOAL_LABELS = {
      calorieTotal: "月总热量",
      durationTotal: "月总时长",
      exerciseDays: "运动天数",
      exerciseTimes: "运动次数",
      runningDistance: "跑步距离",
      cyclingDistance: "骑行距离",
      ringClosedDays: "三环闭合"
    };
    var GOAL_UNITS = {
      calorieTotal: "kcal",
      durationTotal: "分钟",
      exerciseDays: "天",
      exerciseTimes: "次",
      runningDistance: "km",
      cyclingDistance: "km",
      ringClosedDays: "天"
    };

    var progressList = (stats.targetProgressList || []).map(function (item) {
      return {
        goalType: item.goalType,
        goalTypeLabel: GOAL_LABELS[item.goalType] || item.goalType,
        doneValue: item.doneValue || 0,
        targetValue: item.targetValue || 0,
        progress: item.progress || 0,
        unit: GOAL_UNITS[item.goalType] || "",
        achieved: item.progress >= 100
      };
    });

    var calorieProgress = null;
    var durationProgress = null;
    var exerciseDaysProgress = null;
    var exerciseTimesProgress = null;
    var ringProgress = null;

    progressList.forEach(function (item) {
      if (item.goalType === "calorieTotal") calorieProgress = item;
      if (item.goalType === "durationTotal") durationProgress = item;
      if (item.goalType === "exerciseDays") exerciseDaysProgress = item;
      if (item.goalType === "exerciseTimes") exerciseTimesProgress = item;
      if (item.goalType === "ringClosedDays") ringProgress = item;
    });

    return {
      totalCalories: calorieProgress ? calorieProgress.doneValue : 0,
      totalDuration: durationProgress ? durationProgress.doneValue : 0,
      exerciseDays: exerciseDaysProgress ? exerciseDaysProgress.doneValue : 0,
      exerciseTimes: exerciseTimesProgress ? exerciseTimesProgress.doneValue : 0,
      ringClosedDays: ringProgress ? ringProgress.doneValue : 0,
      totalRecords: (stats.recordSummary && stats.recordSummary.validRecordCount) || 0,
      targetProgressList: progressList,
      overallProgress: stats.overallProgress || 0,
      completed: !!stats.completed
    };
  },

  /** 本地备用统计（云函数未部署时使用） */
  calcStatsFallback(records) {
    let totalCalories = 0;
    let totalDuration = 0;
    let totalDistance = 0;
    records.forEach((r) => {
      totalCalories += r.calories || 0;
      totalDuration += r.duration || 0;
      totalDistance += r.distance || 0;
    });
    return { totalCalories, totalDuration, totalDistance, exerciseDays: records.length, exerciseTimes: 0, ringClosedDays: 0, targetProgressList: [] };
  },

  /** 格式化显示日期 */
  formatDisplayDate(dateStr) {
    if (!dateStr) return "--";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    if (isToday) return `${m}.${day} 今天`;
    if (isYesterday) return `${m}.${day} 昨天`;
    return `${m}.${day}`;
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/home/index/index" }) });
  },

  /** 筛选：全部 */
  handleFilterAll() {
    this.setData({ filterType: "all", filterLabel: "全部记录", filteredRecords: this.data.records });
  },

  /** 筛选：补卡 */
  handleFilterMakeup() {
    const makeup = this.data.records.filter((r) => r.isMakeup);
    this.setData({ filterType: "makeup", filterLabel: "补卡记录", filteredRecords: makeup });
  },

  applyFilter() {
    if (this.data.filterType === "makeup") {
      const makeup = this.data.records.filter((r) => r.isMakeup);
      this.setData({ filteredRecords: makeup });
    } else {
      this.setData({ filteredRecords: this.data.records });
    }
  }
});
