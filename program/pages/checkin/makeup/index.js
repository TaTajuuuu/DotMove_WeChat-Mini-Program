const checkinService = require("../../../services/checkin");
const authService = require("../../../services/auth");
const { uploadCheckinPhotos, deleteCloudFiles } = require("../../../utils/photo");
const { routes } = require("../../../config/routes");
const { formatDateKey, getYesterdayDateKey, getDayBeforeYesterdayDateKey } = require("../../../utils/date");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    groupId: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    dateOptions: [],
    sportDate: "",
    metrics: {},
    photos: [],
    remark: "",
    submitting: false
  },

  onLoad(options = {}) {
    const today = formatDateKey();
    const dateOptions = [getYesterdayDateKey(today), getDayBeforeYesterdayDateKey(today)];
    this.setData({
      groupId: options.groupId || "",
      dateOptions,
      sportDate: dateOptions[0]
    });
    this.loadContext(options.groupId || "");
  },

  async loadContext(groupId) {
    try {
      await checkinService.getCheckinContext({ groupId });
      this.setData({ pageState: PageState.READY, errorMessage: "" });
    } catch (error) {
      this.setData({ pageState: error.pageState || PageState.ERROR, errorMessage: error.message || "加载失败。" });
    }
  },

  handleDateChange(event) {
    this.setData({ sportDate: this.data.dateOptions[event.detail.value], errorMessage: "" });
  },

  handleMetricInput(event) {
    this.setData({ [`metrics.${event.currentTarget.dataset.field}`]: event.detail.value, errorMessage: "" });
  },

  handleRingChange(event) {
    this.setData({ "metrics.ringClosed": event.detail.value.length > 0, errorMessage: "" });
  },

  handleRemarkInput(event) {
    this.setData({ remark: event.detail.value || "", errorMessage: "" });
  },

  choosePhotos() {
    wx.chooseMedia({
      count: 3,
      mediaType: ["image"],
      sizeType: ["compressed"],
      success: (res) => {
        const photos = (res.tempFiles || []).map((file, index) => ({
          tempFilePath: file.tempFilePath,
          size: file.size
        }));
        this.setData({ photos, errorMessage: "" });
      }
    });
  },

  removePhoto(event) {
    const index = event.currentTarget.dataset.index;
    const photos = this.data.photos.filter((_, i) => i !== index);
    this.setData({ photos, errorMessage: "" });
  },

  async handleSubmit() {
    this.setData({ submitting: true, errorMessage: "" });
    let uploadedPhotos = [];
    try {
      if (this.data.photos.length > 0) {
        wx.showLoading({ title: "上传照片中" });
        const currentUser = await authService.getCurrentUser();
        const userId = currentUser.data.userId;
        uploadedPhotos = await uploadCheckinPhotos({
          photos: this.data.photos,
          groupId: this.data.groupId,
          userId
        });
        wx.hideLoading();
      }
      await checkinService.createMakeup({
        groupId: this.data.groupId,
        sportDate: this.data.sportDate,
        metrics: this.data.metrics,
        photos: uploadedPhotos,
        remark: this.data.remark
      }, { loadingText: "提交中" });
      wx.redirectTo({ url: `${routes.checkinRecords}?groupId=${this.data.groupId}` });
    } catch (error) {
      if (uploadedPhotos.length > 0) {
        const fileIds = uploadedPhotos.map((p) => p.url);
        deleteCloudFiles(fileIds);
      }
      wx.hideLoading();
      this.setData({ submitting: false, errorMessage: error.message || "提交失败。" });
    }
  }
});
