const checkinService = require("../../../services/checkin");
const authService = require("../../../services/auth");
const { uploadCheckinPhotos, deleteCloudFiles } = require("../../../utils/photo");
const privacyUtils = require("../../../utils/privacy");
const { PageState } = require("../../../config/page-states");

const METRIC_CONFIG = [
  { key: "calories", label: "消耗热量", unit: "kcal" },
  { key: "durationMinutes", label: "运动时长", unit: "分钟" },
  { key: "runningDistanceKm", label: "跑步距离", unit: "km" },
  { key: "cyclingDistanceKm", label: "骑行距离", unit: "km" },
  { key: "ringClosed", label: "三环闭合", unit: "" }
];

function formatDate(dateKey) {
  const parts = String(dateKey || "").split("-");
  if (parts.length !== 3) return dateKey || "--";
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function getReviewStatusText(record) {
  if (record.contentReviewStatus === "pending") return "审核中";
  if (record.contentReviewStatus === "rejected") return "审核未通过";
  if (record.contentReviewStatus === "failed") return "审核提交失败";
  return record.status === "edited" ? "已编辑" : "有效";
}

Page({
  data: {
    checkinRecordId: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    group: null,
    member: null,
    record: null,
    metricItems: [],
    photos: [],
    editing: false,
    saving: false,
    editFields: [],
    editFieldValues: {},
    showEditRings: false,
    editRingsClosed: false,
    editPhotos: [],
    originalPhotoFileIds: [],
    editRemark: "",
    editErrorMessage: "",
    showPrivacyDialog: false,
    pendingPhotoCount: 1
  },

  onLoad(options = {}) {
    const checkinRecordId = options.checkinRecordId || "";
    this.setData({ checkinRecordId });
    this.loadDetail();
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  async loadDetail() {
    if (!this.data.checkinRecordId) {
      this.setData({ pageState: PageState.ERROR, errorMessage: "缺少打卡记录信息。" });
      return;
    }

    this.setData({ pageState: PageState.LOADING, errorMessage: "" });
    try {
      const result = await checkinService.getCheckinRecordDetail({
        checkinRecordId: this.data.checkinRecordId
      });
      const data = result.data || {};
      const record = data.record || {};
      const metrics = record.metrics || {};
      const metricItems = METRIC_CONFIG
        .filter((item) => Object.prototype.hasOwnProperty.call(metrics, item.key))
        .map((item) => ({
          key: item.key,
          label: item.label,
          value: item.key === "ringClosed" ? (metrics[item.key] ? "已闭合" : "未闭合") : metrics[item.key],
          unit: item.unit
        }));
      const editFields = METRIC_CONFIG
        .filter((item) => item.key !== "ringClosed" && Object.prototype.hasOwnProperty.call(metrics, item.key))
        .map((item) => ({ ...item }));
      const editFieldValues = {};
      editFields.forEach((item) => {
        editFieldValues[item.key] = String(metrics[item.key]);
      });
      const photos = (record.photos || []).map((photo, index) => ({
        ...photo,
        index,
        key: photo.fileId || `existing-${index}`,
        source: "existing",
        loadFailed: Boolean(photo.loadFailed)
      }));

      this.setData({
        pageState: PageState.READY,
        group: data.group || null,
        member: data.member || null,
        record: {
          ...record,
          sportDateText: formatDate(record.sportDate),
          submitDateText: formatDate(record.submitDate),
          typeText: record.isMakeup ? "补卡" : "打卡",
          statusText: getReviewStatusText(record)
        },
        metricItems,
        photos,
        editing: false,
        saving: false,
        editFields,
        editFieldValues,
        showEditRings: Object.prototype.hasOwnProperty.call(metrics, "ringClosed"),
        editRingsClosed: metrics.ringClosed === true,
        editPhotos: photos.map((photo) => ({ ...photo })),
        originalPhotoFileIds: photos.map((photo) => photo.fileId).filter(Boolean),
        editRemark: record.remark || "",
        editErrorMessage: ""
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "记录加载失败。"
      });
    }
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/checkin/create/index" }) });
  },

  handlePreviewPhoto(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const urls = this.data.photos.filter((photo) => !photo.loadFailed && photo.url).map((photo) => photo.url);
    const currentPhoto = this.data.photos[index];
    if (!currentPhoto || currentPhoto.loadFailed || !currentPhoto.url || urls.length === 0) return;
    wx.previewImage({ current: currentPhoto.url, urls });
  },

  handlePhotoError(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.setData({ [`photos[${index}].loadFailed`]: true });
  },

  handleStartEdit() {
    if (!this.data.record || !this.data.record.canEdit) return;
    this.setData({ editing: true, editErrorMessage: "" });
  },

  handleCancelEdit() {
    const metrics = (this.data.record && this.data.record.metrics) || {};
    const editFieldValues = {};
    this.data.editFields.forEach((item) => {
      editFieldValues[item.key] = String(metrics[item.key]);
    });
    this.setData({
      editing: false,
      editFieldValues,
      editRingsClosed: metrics.ringClosed === true,
      editPhotos: this.data.photos.map((photo) => ({ ...photo, source: "existing" })),
      editRemark: (this.data.record && this.data.record.remark) || "",
      editErrorMessage: ""
    });
  },

  handleEditFieldInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`editFieldValues.${key}`]: event.detail.value, editErrorMessage: "" });
  },

  handleToggleEditRings() {
    this.setData({ editRingsClosed: !this.data.editRingsClosed, editErrorMessage: "" });
  },

  handleEditRemarkInput(event) {
    this.setData({ editRemark: event.detail.value || "", editErrorMessage: "" });
  },

  handleChooseEditPhoto() {
    const remain = 3 - this.data.editPhotos.length;
    if (remain <= 0) return;

    privacyUtils.setPrivacyPromptHandler(() => {
      this.setData({
        showPrivacyDialog: true,
        pendingPhotoCount: remain,
        editErrorMessage: ""
      });
    });
    this.openEditPhotoPicker(remain);
  },

  openEditPhotoPicker(count) {
    privacyUtils.chooseImageMedia({ count })
      .then((result) => {
        const newPhotos = (result.tempFiles || []).map((file, index) => ({
          source: "local",
          tempFilePath: file.tempFilePath,
          size: file.size,
          key: `local-${Date.now()}-${index}`
        }));
        if (newPhotos.length > 0) {
          this.setData({
            editPhotos: this.data.editPhotos.concat(newPhotos),
            editErrorMessage: ""
          });
        }
      })
      .catch((error) => {
        if (error && error.code === "PRIVACY_AUTH_REQUIRED") {
          if (this._privacyDeclined) {
            this._privacyDeclined = false;
            this.setData({
              showPrivacyDialog: false,
              editErrorMessage: "需要同意隐私保护指引后才能选择运动照片。"
            });
            return;
          }
          privacyUtils.clearPrivacyAuthorization();
          this.setData({
            showPrivacyDialog: true,
            pendingPhotoCount: count,
            editErrorMessage: ""
          });
          return;
        }
        const editErrorMessage = error.message || "需要同意隐私保护指引后才能选择照片。";
        this.setData({ editErrorMessage });
        wx.showToast({ title: editErrorMessage, icon: "none" });
      });
  },

  handleAgreePrivacyAuthorization() {
    if (this._privacyAgreeInProgress) return;
    this._privacyAgreeInProgress = true;
    const count = this.data.pendingPhotoCount || 1;
    privacyUtils.markPrivacyAuthorized();
    this.setData({ showPrivacyDialog: false });
    if (!privacyUtils.resolvePrivacyAuthorization(true)) {
      this.openEditPhotoPicker(count);
    }
    setTimeout(() => {
      this._privacyAgreeInProgress = false;
    }, 500);
  },

  handleCancelPrivacyAuthorization() {
    this._privacyDeclined = true;
    privacyUtils.resolvePrivacyAuthorization(false);
    this.setData({
      showPrivacyDialog: false,
      editErrorMessage: "需要同意隐私保护指引后才能选择运动照片。"
    });
  },

  handlePreviewEditPhoto(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const urls = this.data.editPhotos
      .map((photo) => photo.source === "local" ? photo.tempFilePath : photo.url)
      .filter(Boolean);
    const currentPhoto = this.data.editPhotos[index];
    const current = currentPhoto && (currentPhoto.source === "local" ? currentPhoto.tempFilePath : currentPhoto.url);
    if (!current || urls.length === 0) return;
    wx.previewImage({ current, urls });
  },

  handleRemoveEditPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    const editPhotos = this.data.editPhotos.slice();
    editPhotos.splice(index, 1);
    this.setData({ editPhotos, editErrorMessage: "" });
  },

  handleOpenPrivacyContract() {
    privacyUtils.openPrivacyContract();
  },

  buildEditMetrics() {
    const metrics = {};
    for (const field of this.data.editFields) {
      const raw = String(this.data.editFieldValues[field.key] || "").trim();
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${field.label}必须是大于 0 的数字。`);
      }
      metrics[field.key] = Math.round(value * 100) / 100;
    }
    if (this.data.showEditRings) {
      metrics.ringClosed = this.data.editRingsClosed === true;
    }
    return metrics;
  },

  async handleSaveEdit() {
    if (this.data.editPhotos.length < 1 || this.data.editPhotos.length > 3) {
      this.setData({ editErrorMessage: "请保留 1 至 3 张运动照片。" });
      return;
    }

    let metrics;
    try {
      metrics = this.buildEditMetrics();
    } catch (error) {
      this.setData({ editErrorMessage: error.message });
      return;
    }

    this.setData({ saving: true, editErrorMessage: "" });
    let uploadedPhotos = [];

    try {
      const localPhotos = this.data.editPhotos.filter((photo) => photo.source === "local");
      if (localPhotos.length > 0) {
        const currentUser = await authService.getCurrentUser();
        uploadedPhotos = await uploadCheckinPhotos({
          photos: localPhotos,
          groupId: this.data.group.groupId,
          userId: currentUser.data.userId
        });
      }

      let uploadIndex = 0;
      const finalPhotos = this.data.editPhotos.map((photo, index) => {
        if (photo.source === "local") {
          const uploaded = uploadedPhotos[uploadIndex++];
          return { ...uploaded, sort: index + 1 };
        }
        return {
          fileId: photo.fileId,
          url: photo.fileId || photo.url,
          cloudPath: photo.cloudPath || "",
          name: photo.name || "",
          mimeType: photo.mimeType || "",
          sort: index + 1
        };
      });

      const result = await checkinService.updateCheckinRecord({
        checkinRecordId: this.data.checkinRecordId,
        metrics,
        photos: finalPhotos,
        remark: this.data.editRemark
      }, { loadingText: "保存中" });

      const retainedFileIds = new Set(finalPhotos.map((photo) => photo.fileId).filter(Boolean));
      const removedFileIds = this.data.originalPhotoFileIds.filter((fileId) => !retainedFileIds.has(fileId));
      if (removedFileIds.length > 0) {
        await deleteCloudFiles(removedFileIds);
      }

      wx.showToast({
        title: result.data && result.data.contentReviewStatus === "failed"
          ? "已保存，审核提交失败"
          : "修改已提交审核",
        icon: "none"
      });
      await this.loadDetail();
    } catch (error) {
      if (uploadedPhotos.length > 0) {
        await deleteCloudFiles(uploadedPhotos.map((photo) => photo.fileId || photo.url));
      }
      this.setData({
        saving: false,
        editErrorMessage: error.message || "保存失败，请重试。"
      });
    }
  },

  handleRetry() {
    this.loadDetail();
  }
});
