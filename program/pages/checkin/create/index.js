const checkinService = require("../../../services/checkin");
const authService = require("../../../services/auth");
const { uploadCheckinPhotos, deleteCloudFiles } = require("../../../utils/photo");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    groupId: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    context: null,
    metrics: {},
    photos: [],
    remark: "",
    submitting: false
  },

  onLoad(options = {}) {
    this.setData({ groupId: options.groupId || "" });
    this.loadContext(options.groupId || "");
  },

  async loadContext(groupId) {
    if (!groupId) {
      this.setData({ pageState: PageState.ERROR, errorMessage: "缺少小组信息。" });
      return;
    }
    try {
      const result = await checkinService.getCheckinContext({ groupId });
      this.setData({ pageState: PageState.READY, context: result.data, errorMessage: "" });
    } catch (error) {
      this.setData({ pageState: error.pageState || PageState.ERROR, errorMessage: error.message || "加载失败。" });
    }
  },

  handleMetricInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`metrics.${field}`]: event.detail.value, errorMessage: "" });
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
      await checkinService.createCheckin({
        groupId: this.data.groupId,
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
