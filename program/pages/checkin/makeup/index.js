const checkinService = require("../../../services/checkin");
const authService = require("../../../services/auth");
const { uploadCheckinPhotos, deleteCloudFiles } = require("../../../utils/photo");
const { routes } = require("../../../config/routes");
const { formatDateKey, getYesterdayDateKey, getDayBeforeYesterdayDateKey } = require("../../../utils/date");
const { PageState } = require("../../../config/page-states");

function formatShortLabel(dateKey) {
  const parts = String(dateKey || "").split("-");
  return parts.length === 3 ? `${Number(parts[1])}.${Number(parts[2])}` : dateKey;
}

function buildGoalFields(selectedGoalTypes) {
  const allFields = [
    { key: "calories", goalTypes: ["calorieTotal", "exerciseDays", "exerciseTimes"], label: "消耗热量", unit: "kcal", desc: "用于月总最低热量、运动天数和运动次数统计。" },
    { key: "durationMinutes", goalTypes: ["durationTotal"], label: "运动时长", unit: "分钟", desc: "累计到本月运动时长目标。" },
    { key: "runningDistanceKm", goalTypes: ["runningDistance"], label: "跑步距离", unit: "km", desc: "累计到本月跑步距离目标。" },
    { key: "cyclingDistanceKm", goalTypes: ["cyclingDistance"], label: "骑行距离", unit: "km", desc: "累计到本月骑行距离目标。" }
  ];

  return {
    fields: allFields.filter((field) => field.goalTypes.some((goalType) => selectedGoalTypes.indexOf(goalType) !== -1)),
    showRings: selectedGoalTypes.indexOf("ringClosedDays") !== -1
  };
}

Page({
  data: {
    groupId: "",
    groupName: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    yesterdayKey: "",
    dayBeforeKey: "",
    yesterdayLabel: "",
    dayBeforeLabel: "",
    selectedDate: "",
    goalFields: [],
    showRings: false,
    fieldValues: {},
    ringsClosed: false,
    photos: [],
    remark: "",
    submitting: false
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  onLoad(options = {}) {
    const today = formatDateKey();
    const yesterdayKey = getYesterdayDateKey(today);
    const dayBeforeKey = getDayBeforeYesterdayDateKey(today);

    this.setData({
      groupId: options.groupId || "",
      groupName: decodeURIComponent(options.groupName || ""),
      yesterdayKey,
      dayBeforeKey,
      yesterdayLabel: formatShortLabel(yesterdayKey),
      dayBeforeLabel: formatShortLabel(dayBeforeKey),
      selectedDate: yesterdayKey
    });
    this.loadContext(options.groupId || "");
  },

  async loadContext(groupId) {
    try {
      const result = await checkinService.getCheckinContext({ groupId });
      const context = result.data || {};
      const selectedGoalTypes = (context.targetConfig && context.targetConfig.selectedGoalTypes) || [];
      const goalResult = buildGoalFields(selectedGoalTypes);

      this.setData({
        groupName: this.data.groupName || (context.group && context.group.name) || "",
        goalFields: goalResult.fields,
        showRings: goalResult.showRings,
        pageState: PageState.READY,
        errorMessage: ""
      });
    } catch (error) {
      this.setData({ pageState: error.pageState || PageState.ERROR, errorMessage: error.message || "加载失败。" });
    }
  },

  handleDateSelect(event) {
    this.setData({ selectedDate: event.currentTarget.dataset.date, errorMessage: "" });
  },

  handleFieldInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`fieldValues.${key}`]: event.detail.value, errorMessage: "" });
  },

  handleToggleRings() {
    this.setData({ ringsClosed: !this.data.ringsClosed, errorMessage: "" });
  },

  handleRemarkInput(event) {
    this.setData({ remark: event.detail.value || "", errorMessage: "" });
  },

  handleChoosePhoto() {
    const remain = 3 - this.data.photos.length;
    if (remain <= 0) return;

    wx.chooseMedia({
      count: remain,
      mediaType: ["image"],
      sizeType: ["compressed"],
      success: (res) => {
        const newFiles = (res.tempFiles || []).map((file) => ({
          tempFilePath: file.tempFilePath,
          size: file.size
        }));
        this.setData({ photos: this.data.photos.concat(newFiles), errorMessage: "" });
      }
    });
  },

  handlePreviewPhoto(event) {
    const index = event.currentTarget.dataset.index;
    const urls = this.data.photos.map((photo) => photo.tempFilePath);
    wx.previewImage({ current: urls[index], urls });
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/home/index/index" }) });
  },

  buildMetrics() {
    const metrics = {};
    const fields = this.data.goalFields || [];

    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      const raw = String((this.data.fieldValues || {})[field.key] || "").trim();
      if (!raw) {
        throw new Error(`请填写${field.label}。`);
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${field.label}必须是大于0的数字。`);
      }
      metrics[field.key] = Math.round(value * 100) / 100;
    }

    if (this.data.showRings) {
      metrics.ringClosed = this.data.ringsClosed === true;
    }

    return metrics;
  },

  async handleSubmit() {
    if (this.data.photos.length < 1 || this.data.photos.length > 3) {
      this.setData({ errorMessage: "请上传 1 至 3 张运动照片。" });
      return;
    }

    let metrics;
    try {
      metrics = this.buildMetrics();
    } catch (error) {
      this.setData({ errorMessage: error.message });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    let uploadedPhotos = [];

    try {
      wx.showLoading({ title: "上传照片中" });
      const currentUser = await authService.getCurrentUser();
      uploadedPhotos = await uploadCheckinPhotos({
        photos: this.data.photos,
        groupId: this.data.groupId,
        userId: currentUser.data.userId
      });
      wx.hideLoading();

      await checkinService.createMakeup({
        groupId: this.data.groupId,
        sportDate: this.data.selectedDate,
        metrics,
        photos: uploadedPhotos,
        remark: this.data.remark,
        requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      }, { loadingText: "提交中" });

      wx.redirectTo({ url: `${routes.checkinRecords}?groupId=${this.data.groupId}` });
    } catch (error) {
      if (uploadedPhotos.length > 0) {
        deleteCloudFiles(uploadedPhotos.map((photo) => photo.fileId || photo.url));
      }
      wx.hideLoading();
      this.setData({ submitting: false, errorMessage: error.message || "提交失败。" });
    }
  }
});
