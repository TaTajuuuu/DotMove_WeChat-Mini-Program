const targetService = require("../../../services/target");
const { routes } = require("../../../config/routes");

const goalLabels = {
  calorieTotal: "月总最低热量",
  durationTotal: "运动时长",
  exerciseDays: "运动天数",
  exerciseTimes: "运动次数",
  runningDistance: "跑步距离",
  cyclingDistance: "骑行距离",
  ringClosedDays: "三环闭合"
};

Page({
  data: {
    groupId: "",
    coinValue: 0,
    selectedGoalTypes: [],
    goalLabels,
    form: {},
    errorMessage: "",
    submitting: false
  },

  onLoad(options = {}) {
    const selectedGoalTypes = options.selectedGoalTypes ? JSON.parse(decodeURIComponent(options.selectedGoalTypes)) : [];
    this.setData({
      groupId: options.groupId || "",
      coinValue: Number(options.coinValue || 0),
      selectedGoalTypes
    });
  },

  handleInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: event.detail.value,
      errorMessage: ""
    });
  },

  positiveNumber(field) {
    const value = Number(this.data.form[field]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("请输入有效目标值。");
    }
    return value;
  },

  buildGoals() {
    const goals = {};
    const selected = this.data.selectedGoalTypes;

    if (selected.indexOf("calorieTotal") >= 0) {
      goals.calorieTotal = { targetKcal: this.positiveNumber("calorieTotal.targetKcal") };
    }
    if (selected.indexOf("durationTotal") >= 0) {
      goals.durationTotal = { targetHours: this.positiveNumber("durationTotal.targetHours") };
    }
    if (selected.indexOf("exerciseDays") >= 0) {
      goals.exerciseDays = {
        targetDays: this.positiveNumber("exerciseDays.targetDays"),
        minKcalPerDay: this.positiveNumber("exerciseDays.minKcalPerDay")
      };
    }
    if (selected.indexOf("exerciseTimes") >= 0) {
      goals.exerciseTimes = {
        targetTimes: this.positiveNumber("exerciseTimes.targetTimes"),
        minKcalPerTime: this.positiveNumber("exerciseTimes.minKcalPerTime")
      };
    }
    if (selected.indexOf("runningDistance") >= 0) {
      goals.runningDistance = { targetKm: this.positiveNumber("runningDistance.targetKm") };
    }
    if (selected.indexOf("cyclingDistance") >= 0) {
      goals.cyclingDistance = { targetKm: this.positiveNumber("cyclingDistance.targetKm") };
    }
    if (selected.indexOf("ringClosedDays") >= 0) {
      goals.ringClosedDays = { targetDays: this.positiveNumber("ringClosedDays.targetDays") };
    }

    return goals;
  },

  async handleSave() {
    let goals;
    try {
      goals = this.buildGoals();
    } catch (error) {
      this.setData({ errorMessage: error.message });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    try {
      await targetService.saveTargetConfig({
        groupId: this.data.groupId,
        coinValue: this.data.coinValue,
        selectedGoalTypes: this.data.selectedGoalTypes,
        goals
      }, { loadingText: "保存中" });
      wx.redirectTo({ url: `${routes.myTargetDetail}?groupId=${this.data.groupId}` });
    } catch (error) {
      this.setData({
        submitting: false,
        errorMessage: error.message || "保存失败，请稍后重试。"
      });
    }
  }
});
