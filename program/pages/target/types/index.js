const targetService = require("../../../services/target");
const { routes } = require("../../../config/routes");

const goalTypes = [
  { key: "calorieTotal", name: "月总最低热量", desc: "按 kcal 累计" },
  { key: "durationTotal", name: "运动时长", desc: "按小时累计" },
  { key: "exerciseDays", name: "运动天数", desc: "需设置单天最低热量" },
  { key: "exerciseTimes", name: "运动次数", desc: "需设置单次最低热量" },
  { key: "runningDistance", name: "跑步距离", desc: "按 km 累计" },
  { key: "cyclingDistance", name: "骑行距离", desc: "按 km 累计" },
  { key: "ringClosedDays", name: "三环闭合", desc: "按闭合日期累计" }
];

Page({
  data: {
    groupId: "",
    goalTypes,
    selectedGoalTypes: [],
    coinValue: "0",
    canEdit: false,
    targetStatus: "unset",
    errorMessage: ""
  },

  onLoad(options = {}) {
    this.setData({ groupId: options.groupId || "" });
    this.loadTargetConfig(options.groupId || "");
  },

  async loadTargetConfig(groupId) {
    if (!groupId) {
      this.setData({ errorMessage: "缺少小组信息。" });
      return;
    }
    try {
      const result = await targetService.getTargetConfig({ groupId });
      const targetConfig = (result.data && result.data.targetConfig) || {};
      this.setData({
        selectedGoalTypes: targetConfig.selectedGoalTypes || [],
        coinValue: String(targetConfig.coinValue || 0),
        canEdit: Boolean(result.data && result.data.canEdit),
        targetStatus: targetConfig.status || "unset"
      });
    } catch (error) {
      this.setData({ errorMessage: error.message || "加载目标失败。" });
    }
  },

  handleToggleGoal(event) {
    if (!this.data.canEdit) {
      return;
    }
    const key = event.currentTarget.dataset.key;
    const selected = this.data.selectedGoalTypes.slice();
    const index = selected.indexOf(key);
    if (index >= 0) {
      selected.splice(index, 1);
    } else {
      selected.push(key);
    }
    this.setData({ selectedGoalTypes: selected, errorMessage: "" });
  },

  handleCoinInput(event) {
    this.setData({ coinValue: event.detail.value || "", errorMessage: "" });
  },

  handleNext() {
    const coin = Number(this.data.coinValue);
    if (!this.data.canEdit) {
      this.setData({ errorMessage: "目标已锁定。" });
      return;
    }
    if (!this.data.selectedGoalTypes.length) {
      this.setData({ errorMessage: "请至少选择一个目标类型。" });
      return;
    }
    if (!Number.isFinite(coin) || coin < 0) {
      this.setData({ errorMessage: "请输入有效一点币值。" });
      return;
    }
    wx.navigateTo({
      url: `${routes.targetValues}?groupId=${this.data.groupId}&coinValue=${encodeURIComponent(this.data.coinValue)}&selectedGoalTypes=${encodeURIComponent(JSON.stringify(this.data.selectedGoalTypes))}`
    });
  }
});
