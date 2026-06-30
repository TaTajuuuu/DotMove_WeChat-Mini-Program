var routes = require("../../../config/routes").routes;
var checkinService, groupService, authService, photoUtils, privacyUtils;

Page({
  data: {
    groups: [],
    loading: true,
    selectedIndex: -1,
    groupId: "",
    groupName: "",
    todayLabel: "",
    // 动态字段（根据目标类型显示）
    goalFields: [],
    showRings: false,
    fieldValues: {},
    ringsClosed: false,
    photos: [],
    remark: "",
    remainingTodayCount: 5,
    errorMessage: "",
    submitting: false,
    showPrivacyDialog: false,
    pendingPhotoCount: 1
  },

  onLoad: function(options) {
    this.initToday();
    if (options && options.groupId) {
      var groupId = options.groupId;
      var groupName = decodeURIComponent(options.groupName || "");
      this.setData({ groupId: groupId, groupName: groupName, loading: true });
      this.loadCheckinContext(groupId, groupName);
    }
  },

  // 选完小组后拉取打卡上下文（目标类型）
  loadCheckinContext: function(groupId, groupName) {
    var self = this;
    if (!checkinService) checkinService = require("../../../services/checkin");
    checkinService.getCheckinContext({ groupId: groupId }).then(function(res) {
      var ctx = res.data || {};
      var selectedGoalTypes = (ctx.targetConfig && ctx.targetConfig.selectedGoalTypes) || [];
      var result = self.buildGoalFields(selectedGoalTypes);
      self.setData({
        groupId: groupId,
        groupName: groupName,
        goalFields: result.fields,
        showRings: result.showRings,
        fieldValues: {},
        ringsClosed: false,
        photos: [],
        remark: "",
        remainingTodayCount: Number.isFinite(ctx.remainingTodayCount) ? ctx.remainingTodayCount : 5,
        errorMessage: "",
        loading: false
      });
    }).catch(function(err) {
      self.setData({ loading: false });
      wx.showModal({
        title: "无法打卡",
        content: (err && err.message) || "该小组目标未设置，请先设置目标。",
        showCancel: false,
        success: function() { wx.navigateBack(); }
      });
    });
  },

  onShow: function() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    // Tab 页面会被微信缓存。每次回到小组选择状态都重新拉取，
    // 避免创建、加入或成员变化后继续展示旧列表。
    if (!this.data.groupId) {
      this.loadGroups();
    }
  },

  initToday: function() {
    var now = new Date();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    this.setData({ todayLabel: m + "." + d + " 今天" });
  },

  loadGroups: function() {
    var self = this;
    self.setData({ loading: true });

    if (!groupService) groupService = require("../../../services/group");

    groupService.getHomeEntry().then(function(res) {
      var raw = res.data && res.data.currentGroups || [];
      // 只有进行中的小组允许当天打卡；upcoming 小组应等生命周期开始后再出现。
      var groups = raw.filter(function(g) {
        return g.status === "active";
      }).map(function(g) {
        return {
          groupId: g.groupId || g._id,
          groupName: g.groupName || g.name || "未命名",
          status: g.status || "",
          statusText: "进行中",
          progress: g.progressPercent || g.progress || 0,
          memberCount: g.memberCount || g.activeMemberCount || 1
        };
      });
      self.setData({ groups: groups, loading: false });
    }).catch(function(e) {
      console.error("loadGroups error", e);
      self.setData({ loading: false });
    });
  },

  handleSelectGroup: function(e) {
    var index = e.currentTarget.dataset.index;
    var group = this.data.groups[index];
    if (!group) return;
    this.setData({ selectedIndex: index, errorMessage: "" });
    this.loadCheckinContext(group.groupId, group.groupName);
  },

  // 根据 selectedGoalTypes 构建动态字段列表
  buildGoalFields: function(selectedGoalTypes) {
    var allFields = [
      { key: "calories",          goalTypes: ["calorieTotal", "exerciseDays", "exerciseTimes"], label: "消耗热量", unit: "kcal", desc: "用于月总最低热量、运动天数和运动次数统计。" },
      { key: "durationMinutes",    goalTypes: ["durationTotal"], label: "运动时长", unit: "分钟", desc: "累计到本月运动时长目标。" },
      { key: "runningDistanceKm",  goalTypes: ["runningDistance"], label: "跑步距离", unit: "km",   desc: "累计到本月跑步距离目标。" },
      { key: "cyclingDistanceKm",  goalTypes: ["cyclingDistance"], label: "骑行距离", unit: "km",   desc: "累计到本月骑行距离目标。" },
    ];
    var fields = [];
    for (var i = 0; i < allFields.length; i++) {
      var shouldShow = allFields[i].goalTypes.some(function(goalType) {
        return selectedGoalTypes.indexOf(goalType) !== -1;
      });
      if (shouldShow) {
        fields.push(allFields[i]);
      }
    }
    return {
      fields: fields,
      showRings: selectedGoalTypes.indexOf("ringClosedDays") !== -1
    };
  },

  handleChangeGroup: function() {
    this.setData({
      groupId: "",
      groupName: "",
      selectedIndex: -1,
      goalFields: [],
      fieldValues: {},
      ringsClosed: false,
      photos: [],
      remark: "",
      remainingTodayCount: 5,
      errorMessage: ""
    });
  },

  handleBack: function() {
    if (this.data.groupId) {
      this.handleChangeGroup();
    } else {
      wx.navigateBack({
        fail: function() { wx.switchTab({ url: "/pages/home/index/index" }); }
      });
    }
  },

  handleGoCreate: function() {
    wx.navigateTo({ url: routes.groupCreate });
  },

  handleGoJoin: function() {
    wx.navigateTo({ url: routes.groupJoin });
  },

  handleFieldInput: function(e) {
    var key = e.currentTarget.dataset.key;
    var value = e.detail.value;
    var fv = this.data.fieldValues;
    fv[key] = value;
    this.setData({ fieldValues: fv, errorMessage: "" });
  },

  handleToggleRings: function() {
    this.setData({ ringsClosed: !this.data.ringsClosed, errorMessage: "" });
  },

  handleRemarkInput: function(e) {
    this.setData({ remark: e.detail.value || "", errorMessage: "" });
  },

  handleChoosePhoto: function() {
    var self = this;
    var remain = 3 - self.data.photos.length;
    if (remain <= 0) return;
    if (!privacyUtils) privacyUtils = require("../../../utils/privacy");
    privacyUtils.setPrivacyPromptHandler(function() {
      self.setData({
        showPrivacyDialog: true,
        pendingPhotoCount: remain,
        errorMessage: ""
      });
    });
    self.openPhotoPicker(remain);
  },

  openPhotoPicker: function(count) {
    var self = this;
    privacyUtils.chooseImageMedia({ count: count }).then(function(res) {
      var newFiles = (res.tempFiles || []).map(function(f) {
        return { tempFilePath: f.tempFilePath, size: f.size };
      });
      if (newFiles.length > 0) {
        self.setData({ photos: self.data.photos.concat(newFiles), errorMessage: "" });
      }
    }).catch(function(error) {
      if (error && error.code === "PRIVACY_AUTH_REQUIRED") {
        if (self._privacyDeclined) {
          self._privacyDeclined = false;
          self.setData({
            showPrivacyDialog: false,
            errorMessage: "需要同意隐私保护指引后才能选择运动照片。"
          });
          return;
        }
        privacyUtils.clearPrivacyAuthorization();
        self.setData({
          showPrivacyDialog: true,
          pendingPhotoCount: count,
          errorMessage: ""
        });
        return;
      }
      var errorMessage = error.message || "需要同意隐私保护指引后才能选择照片。";
      self.setData({ errorMessage: errorMessage });
      wx.showToast({ title: errorMessage, icon: "none" });
    });
  },

  handleAgreePrivacyAuthorization: function() {
    if (this._privacyAgreeInProgress) return;
    this._privacyAgreeInProgress = true;
    var count = this.data.pendingPhotoCount || 1;
    privacyUtils.markPrivacyAuthorized();
    this.setData({ showPrivacyDialog: false });
    if (!privacyUtils.resolvePrivacyAuthorization(true)) {
      this.openPhotoPicker(count);
    }
    var self = this;
    setTimeout(function() {
      self._privacyAgreeInProgress = false;
    }, 500);
  },

  handleCancelPrivacyAuthorization: function() {
    this._privacyDeclined = true;
    privacyUtils.resolvePrivacyAuthorization(false);
    this.setData({
      showPrivacyDialog: false,
      errorMessage: "需要同意隐私保护指引后才能选择运动照片。"
    });
  },

  handleOpenPrivacyContract: function() {
    if (!privacyUtils) privacyUtils = require("../../../utils/privacy");
    privacyUtils.openPrivacyContract();
  },

  handlePreviewPhoto: function(e) {
    var idx = e.currentTarget.dataset.index;
    var urls = this.data.photos.map(function(p) { return p.tempFilePath; });
    wx.previewImage({ current: urls[idx], urls: urls });
  },

  handleGoMakeup: function() {
    if (!this.data.groupId) return;
    wx.navigateTo({
      url: routes.makeup + "?groupId=" + this.data.groupId,
      fail: function(error) {
        console.error("[checkin] navigate to makeup failed", error);
        wx.showToast({ title: "补卡页面打开失败", icon: "none" });
      }
    });
  },

  handleSubmit: function() {
    var self = this;
    if (!self.data.groupId) {
      self.setData({ errorMessage: "请先选择要打卡的小组。" });
      return;
    }

    if (self.data.photos.length < 1 || self.data.photos.length > 3) {
      self.setData({ errorMessage: "请上传 1 至 3 张运动照片。" });
      return;
    }

    // 验证动态字段：按已设置目标要求填写依赖字段
    var fieldValues = self.data.fieldValues || {};
    var goalFields = self.data.goalFields || [];
    var metrics = {};
    var hasAnyValid = false;
    var errorMsg = "";

    for (var i = 0; i < goalFields.length; i++) {
      var f = goalFields[i];
      var raw = (fieldValues[f.key] || "").replace(/^\s+|\s+$/g, "");
      if (raw.length === 0) {
        errorMsg = "请填写" + f.label + "。";
        break;
      }
      var num = Number(raw);
      if (!Number.isFinite(num) || num <= 0) {
        errorMsg = f.label + "必须是大于0的数字。";
        break;
      }
      metrics[f.key] = Math.round(num * 100) / 100;
      hasAnyValid = true;
    }

    if (errorMsg) {
      self.setData({ errorMessage: errorMsg });
      return;
    }

    if (self.data.showRings) {
      metrics.ringClosed = self.data.ringsClosed === true;
      hasAnyValid = true;
    }

    if (!hasAnyValid) {
      var fieldLabels = goalFields.map(function(f) { return f.label; });
      self.setData({ errorMessage: "请至少填写" + fieldLabels.join("或") + "，或标记三环闭合。" });
      return;
    }

    self.setData({ submitting: true, errorMessage: "" });

    if (!checkinService) checkinService = require("../../../services/checkin");
    if (!authService) authService = require("../../../services/auth");
    if (!photoUtils) photoUtils = require("../../../utils/photo");

    var uploadedPhotos = [];
    var uploadPromise = Promise.resolve();
    if (self.data.photos.length > 0) {
      uploadPromise = authService.getCurrentUser().then(function(userRes) {
        var userId = userRes.data.userId;
        return photoUtils.uploadCheckinPhotos({
          photos: self.data.photos,
          groupId: self.data.groupId,
          userId: userId
        });
      }).then(function(result) {
        uploadedPhotos = result;
      }).catch(function(uploadErr) {
        console.error("photo upload error", uploadErr);
        throw uploadErr;
      });
    }

    uploadPromise.then(function() {
      return checkinService.createCheckin({
        groupId: self.data.groupId,
        metrics: metrics,
        photos: uploadedPhotos,
        remark: self.data.remark || "",
        requestId: Date.now() + "-" + Math.random().toString(36).slice(2, 10)
      }, { loadingText: "提交中" });
    }).then(function(result) {
      var reviewStatus = result && result.data && result.data.contentReviewStatus;
      wx.showToast({
        title: reviewStatus === "failed" ? "已保存，审核提交失败" : "已提交审核",
        icon: "none"
      });
      setTimeout(function() {
        wx.redirectTo({ url: routes.checkinRecords + "?groupId=" + self.data.groupId });
      }, 1500);
    }).catch(function(error) {
      if (uploadedPhotos.length > 0) {
        var fileIds = uploadedPhotos.map(function(p) { return p.url; });
        photoUtils.deleteCloudFiles(fileIds);
      }
      wx.hideLoading();
      self.setData({
        submitting: false,
        errorMessage: (error && error.message) || "提交失败，请重试。"
      });
    });
  }
});
