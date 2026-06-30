const groupService = require("../../../services/group");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    pageState: PageState.READY,
    inviteCode: "",
    nickname: "",
    preview: null,
    errorMessage: "",
    submitting: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onLoad(options = {}) {
    const inviteCode = options.inviteCode || options.code || "";
    if (inviteCode) {
      this.setData({ inviteCode });
      this.loadPreview(inviteCode);
    }
  },

  handleInviteInput(event) {
    this.setData({ inviteCode: (event.detail.value || "").trim(), errorMessage: "" });
  },

  handleNicknameInput(event) {
    this.setData({ nickname: event.detail.value || "", errorMessage: "" });
  },

  async loadPreview(inviteCode = this.data.inviteCode) {
    if (!inviteCode) {
      this.setData({ errorMessage: "请先输入邀请码。" });
      return;
    }

    this.setData({ pageState: PageState.LOADING, errorMessage: "" });
    try {
      const result = await groupService.getJoinPreview({ inviteCode });
      this.setData({
        pageState: PageState.READY,
        preview: result.data,
        inviteCode
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "邀请码不可用。",
        preview: null
      });
    }
  },

  handlePreview() {
    this.loadPreview();
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: routes.home }) });
  },

  handleRetry() {
    this.loadPreview();
  },

  async handleJoin() {
    if (this.data.preview && this.data.preview.alreadyMember) {
      wx.redirectTo({ url: `${routes.groupDetail}?groupId=${this.data.preview.groupId}` });
      return;
    }

    const nickname = this.data.nickname.trim();
    if (!nickname || nickname.length > 12) {
      this.setData({ errorMessage: "昵称需为 1 至 12 个字符。" });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await groupService.joinGroup({
        inviteCode: this.data.inviteCode,
        nickname,
        requestId
      }, { loadingText: "加入中" });
      const data = result.data || {};
      const targetUrl = data.alreadyMember
        ? `${routes.groupDetail}?groupId=${data.groupId}`
        : `${routes.targetTypes}?groupId=${data.groupId}`;

      wx.redirectTo({ url: targetUrl });
    } catch (error) {
      this.setData({
        submitting: false,
        errorMessage: error.message || "加入失败，请稍后重试。"
      });
    }
  }
});
