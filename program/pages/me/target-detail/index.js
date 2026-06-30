const targetService = require("../../../services/target");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

/**
 * 目标类型 → 中文显示名 + 单位映射
 */
const GOAL_TYPE_MAP = {
  calorieTotal:    { label: "月总最低热量", unit: "kcal" },
  durationTotal:   { label: "运动时长",      unit: "小时", divisor: 60 },
  exerciseDays:    { label: "运动天数",      unit: "天" },
  exerciseTimes:   { label: "运动次数",      unit: "次" },
  runningDistance: { label: "跑步距离",      unit: "km" },
  cyclingDistance: { label: "骑行距离",      unit: "km" },
  ringClosedDays:  { label: "三环闭合",      unit: "天" }
};

Page({
  data: {
    groupId: "",
    groupName: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    overallProgress: 0,
    memberStats: null,
    progressItems: [], /* 预计算：带中文标签和格式化的指标列表 */
    calendarMonthLabel: "",
    calendarDays: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onLoad(options = {}) {
    const groupId = options.groupId || "";
    const groupName = decodeURIComponent(options.groupName || "");
    this.setData({ groupId, groupName });
    this.loadDetail(groupId);
  },

  async loadDetail(groupId) {
    try {
      const result = await targetService.getMyTargetDetail({ groupId });
      const data = (result && result.data) || {};
      const memberStats = data.memberStats || null;

      // 计算进度列表（中文标签 + 格式化数值）
      const progressItems = this.buildProgressItems(memberStats);
      const calendar = this.buildCalendar({
        monthKey: (data.calendar && data.calendar.monthKey) || (data.group && data.group.monthKey) || "",
        sportDates: (data.calendar && data.calendar.sportDates) || []
      });

      // 总体进度
      let overallProgress = 0;
      if (memberStats && Number.isFinite(memberStats.overallProgress)) {
        overallProgress = Math.round(memberStats.overallProgress);
      } else if (progressItems.length > 0) {
        // 从各指标取平均
        let sum = 0;
        for (let i = 0; i < progressItems.length; i++) {
          sum += progressItems[i].progress || 0;
        }
        overallProgress = Math.round(sum / progressItems.length);
      }

      this.setData({
        pageState: PageState.READY,
        groupName: (data.group && data.group.name) || this.data.groupName,
        memberStats,
        progressItems,
        overallProgress,
        calendarMonthLabel: calendar.monthLabel,
        calendarDays: calendar.days,
        errorMessage: ""
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "加载失败。"
      });
    }
  },

  /**
   * 将 API 返回的 targetProgressList 转换为带中文标签的展示数据
   */
  buildProgressItems(memberStats) {
    var items = [];
    if (!memberStats || !Array.isArray(memberStats.targetProgressList)) return items;

    var list = memberStats.targetProgressList;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var mapping = GOAL_TYPE_MAP[item.goalType];
      if (!mapping) continue;

      var divisor = mapping.divisor || 1;
      var doneValue = item.doneValue != null ? Number(item.doneValue) / divisor : 0;
      var targetValue = item.targetValue != null ? Number(item.targetValue) / divisor : 0;
      doneValue = Math.round(doneValue * 100) / 100;
      targetValue = Math.round(targetValue * 100) / 100;
      var progress = item.progress != null ? Math.round(Number(item.progress)) : 0;

      items.push({
        goalType: item.goalType,
        label: mapping.label,
        unit: mapping.unit,
        doneValue: doneValue,
        targetValue: targetValue,
        progress: progress,
        achievedAt: item.achievedAt || "",
        /* 格式化后的文本 */
        doneText: doneValue + " / " + targetValue + " " + mapping.unit
      });
    }
    return items;
  },

  buildCalendar(calendar = {}) {
    const monthKey = String(calendar.monthKey || "");
    const match = monthKey.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return { monthLabel: "", days: [] };
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const dayCount = new Date(year, month, 0).getDate();
    const doneDates = new Set(Array.isArray(calendar.sportDates) ? calendar.sportDates : []);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const days = [];

    for (let index = 0; index < firstWeekday; index += 1) {
      days.push({ key: `blank-${index}`, day: "", isBlank: true, done: false, isToday: false });
    }

    for (let day = 1; day <= dayCount; day += 1) {
      const date = `${monthKey}-${String(day).padStart(2, "0")}`;
      days.push({
        key: date,
        day,
        date,
        isBlank: false,
        done: doneDates.has(date),
        isToday: date === todayKey
      });
    }

    return {
      monthLabel: `${year}.${String(month).padStart(2, "0")}`,
      days
    };
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/me/index/index' }) });
  },

  handleOpenRecords() {
    wx.navigateTo({ url: `${routes.checkinRecords}?groupId=${this.data.groupId}` });
  }
});
