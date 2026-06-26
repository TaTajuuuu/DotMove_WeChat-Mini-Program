const targetService = require("../../../services/target");
const { routes } = require("../../../config/routes");

const rawGoalTypes = [
  { key: "calorieTotal", name: "月总最低热量", desc: "按 kcal 累计" },
  { key: "durationTotal", name: "运动时长", desc: "按小时累计" },
  { key: "exerciseDays", name: "运动天数", desc: "按天记录" },
  { key: "exerciseTimes", name: "运动次数", desc: "按次记录" },
  { key: "runningDistance", name: "跑步距离", desc: "按 km 累计" },
  { key: "cyclingDistance", name: "骑行距离", desc: "按 km 累计" },
  { key: "ringClosedDays", name: "三环闭合", desc: "是否成功闭合三环" }
];

// 给每个类型加上 selected 字段（WXML 不支持 indexOf）
function buildGoalTypes(selectedKeys) {
  return rawGoalTypes.map(t => ({
    ...t,
    selected: (selectedKeys || []).indexOf(t.key) >= 0
  }));
}

Page({
  data: {
    groupId: "",
    goalTypes: buildGoalTypes([]),
    selectedKeys: [],
    coinValue: "0",
    targetStatus: "unset",
    targetStatusLabel: "未开始 · 可修改",
    errorMessage: ""
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onLoad(options = {}) {
    const groupId = options.groupId || "";
    this.setData({ groupId });
    if (groupId) {
      this.loadTargetConfig(groupId);
    }
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/index/index' }) });
  },

  async loadTargetConfig(groupId) {
    if (!groupId) return;

    try {
      const result = await targetService.getTargetConfig({ groupId });
      const targetConfig = (result.data && result.data.targetConfig) || {};
      const status = targetConfig.status || "unset";
      const keys = targetConfig.selectedGoalTypes || [];

      this.setData({
        goalTypes: buildGoalTypes(keys),
        selectedKeys: keys,
        coinValue: String(targetConfig.coinValue || 0),
        targetStatus: status,
        targetStatusLabel: this.getStatusLabel(status),
        errorMessage: ""
      });
    } catch (error) {
      console.warn('[target/types] loadTargetConfig error:', error);
    }
  },

  getStatusLabel(status) {
    if (status === "locked") return "已锁定";
    if (status === "set") return "已设置";
    return "未开始 · 可修改";
  },

  handleToggleGoal(event) {
    const key = event.currentTarget.dataset.key;
    if (!key) return;

    // 在 selectedKeys 数组上切换
    const keys = this.data.selectedKeys.slice();
    const idx = keys.indexOf(key);
    if (idx >= 0) {
      keys.splice(idx, 1);
    } else {
      keys.push(key);
    }

    // 重新构建带 selected 字段的 goalTypes
    this.setData({
      selectedKeys: keys,
      goalTypes: buildGoalTypes(keys),
      errorMessage: ""
    });
  },

  handleCoinInput(event) {
    this.setData({ coinValue: event.detail.value || "", errorMessage: "" });
  },

  handleNext() {
    const coin = Number(this.data.coinValue) || 0;

    if (!this.data.selectedKeys.length) {
      this.setData({ errorMessage: "请至少选择一个目标类型。" });
      return;
    }

    // 一点币默认为 0，不强制要求
    const safeCoin = Number.isFinite(coin) ? Math.max(0, coin) : 0;

    wx.navigateTo({
      url: `${routes.targetValues}?groupId=${this.data.groupId}&coinValue=${encodeURIComponent(String(safeCoin))}&selectedGoalTypes=${encodeURIComponent(JSON.stringify(this.data.selectedKeys))}`
    });
  }
});
