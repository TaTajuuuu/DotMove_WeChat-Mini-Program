const targetService = require("../../../services/target");
const { routes } = require("../../../config/routes");

/**
 * 目标类型 → 字段定义映射
 * key: 目标类型标识
 */
const FIELD_DEFINITIONS = {
  calorieTotal: {
    key: "calorieTotal.targetKcal",
    label: "月总最低热量",
    placeholder: "10000",
    unit: "kcal",
    hint: "当月有效记录累计热量达到该值即完成该项目标。"
  },
  durationTotal: {
    key: "durationTotal.targetHours",
    label: "运动时长",
    placeholder: "20",
    unit: "小时",
    hint: "当月有效记录累计运动时长达到该值即完成该项目标。"
  },
  exerciseDays: {
    key: "exerciseDays.targetDays",
    label: "运动天数",
    placeholder: "18",
    unit: "天",
    subField: {
      key: "exerciseDays.minKcalPerDay",
      label: "单天最低热量",
      placeholder: "320",
      unit: "kcal"
    }
  },
  exerciseTimes: {
    key: "exerciseTimes.targetTimes",
    label: "运动次数",
    placeholder: "22",
    unit: "次",
    subField: {
      key: "exerciseTimes.minKcalPerTime",
      label: "单次最低热量",
      placeholder: "260",
      unit: "kcal"
    }
  },
  runningDistance: {
    key: "runningDistance.targetKm",
    label: "跑步距离",
    placeholder: "50",
    unit: "km",
    hint: "当月有效记录累计跑步距离达到该值即完成该项目标。"
  },
  cyclingDistance: {
    key: "cyclingDistance.targetKm",
    label: "骑行距离",
    placeholder: "80",
    unit: "km",
    hint: "当月有效记录累计骑行距离达到该值即完成该项目标。"
  },
  ringClosedDays: {
    key: "ringClosedDays.targetDays",
    label: "三环闭合",
    placeholder: "12",
    unit: "天",
    hint: "用户手动标记三环闭合的运动日期计入完成值。"
  }
};

Page({
  data: {
    groupId: "",
    coinValue: 0,          /* 从目标类型页传来，保存时传给云函数 */
    selectedGoalTypes: [],
    fields: [],           /* 预计算的字段列表，避免 WXML indexOf 问题 */
    form: {},             /* 用户填写的表单数据 { fieldKey: value } */
    statusLabel: "",      /* 状态徽章文字 */
    noticeText: "",       /* 底部提示信息 */
    errorMessage: "",
    submitting: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onLoad(options = {}) {
    const groupId = options.groupId || "";

    // 解析一点币（从目标类型页传来）
    let coinValue = 0;
    if (options.coinValue) {
      coinValue = Number(options.coinValue) || 0;
    }

    // 解析选中的目标类型
    let selectedGoalTypes = [];
    try {
      if (options.selectedGoalTypes) {
        selectedGoalTypes = JSON.parse(decodeURIComponent(options.selectedGoalTypes));
      }
    } catch (e) {
      console.warn("[values] 解析 selectedGoalTypes 失败", e);
      selectedGoalTypes = [];
    }

    this.setData({ groupId, coinValue, selectedGoalTypes });

    // 根据选中的目标类型构建字段列表
    this.buildFields(selectedGoalTypes);
  },

  /**
   * 根据选中的目标类型，预计算字段列表
   * 核心修复：不依赖 WXML 的 indexOf，在 JS 中算好再传给模板
   */
  buildFields(selectedGoalTypes) {
    const fields = [];

    for (let i = 0; i < selectedGoalTypes.length; i++) {
      const typeKey = selectedGoalTypes[i];
      const def = FIELD_DEFINITIONS[typeKey];
      if (def) {
        fields.push({ ...def, typeKey });
      } else {
        console.warn("[values] 未知的 goalType:", typeKey);
      }
    }

    // 状态标签
    let statusLabel = "未开始 · 可修改";
    let noticeText = '"进行中"小组已保存目标配置后不可修改。';

    this.setData({
      fields,
      statusLabel,
      noticeText
    });
  },

  /** 输入框变化 */
  handleInput(event) {
    const key = event.currentTarget.dataset.key;
    const value = event.detail.value;
    this.setData({
      [`form.${key}`]: value,
      errorMessage: ""
    });
  },

  /** 返回 */
  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/index/index' }) });
  },

  /** 从 form 对象中按点分路径读取数值 */
  getFormValue(path) {
    const parts = path.split('.');
    let current = this.data.form;
    for (let i = 0; i < parts.length; i++) {
      if (current == null) return undefined;
      current = current[parts[i]];
    }
    return current;
  },

  /** 校验正数 */
  positiveNumber(field) {
    const value = Number(this.getFormValue(field));
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("请输入有效的目标数值。");
    }
    return value;
  },

  /** 构建提交的 goals 对象 */
  buildGoals() {
    const goals = {};
    const fields = this.data.fields;

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];

      if (field.typeKey === "calorieTotal") {
        goals.calorieTotal = { targetKcal: this.positiveNumber(field.key) };
      } else if (field.typeKey === "durationTotal") {
        goals.durationTotal = { targetHours: this.positiveNumber(field.key) };
      } else if (field.typeKey === "exerciseDays") {
        goals.exerciseDays = {
          targetDays: this.positiveNumber(field.key),
          minKcalPerDay: field.subField ? this.positiveNumber(field.subField.key) : 0
        };
      } else if (field.typeKey === "exerciseTimes") {
        goals.exerciseTimes = {
          targetTimes: this.positiveNumber(field.key),
          minKcalPerTime: field.subField ? this.positiveNumber(field.subField.key) : 0
        };
      } else if (field.typeKey === "runningDistance") {
        goals.runningDistance = { targetKm: this.positiveNumber(field.key) };
      } else if (field.typeKey === "cyclingDistance") {
        goals.cyclingDistance = { targetKm: this.positiveNumber(field.key) };
      } else if (field.typeKey === "ringClosedDays") {
        goals.ringClosedDays = { targetDays: this.positiveNumber(field.key) };
      }
    }

    return goals;
  },

  async handleSave() {
    if (this.data.fields.length === 0) {
      this.setData({ errorMessage: "请先选择至少一种目标类型。" });
      return;
    }

    let goals;
    try {
      goals = this.buildGoals();
    } catch (error) {
      this.setData({ errorMessage: error.message });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });

    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await targetService.saveTargetConfig({
        groupId: this.data.groupId,
        coinValue: this.data.coinValue,
        selectedGoalTypes: this.data.selectedGoalTypes,
        goals,
        requestId
      }, { loadingText: "保存中" });

      wx.redirectTo({
        url: `${routes.myTargetDetail}?groupId=${this.data.groupId}`
      });
    } catch (error) {
      this.setData({
        submitting: false,
        errorMessage: error.message || "保存失败，请稍后重试。"
      });
    }
  }
});
