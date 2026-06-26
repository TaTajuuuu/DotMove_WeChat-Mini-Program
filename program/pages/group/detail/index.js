const groupService = require("../../../services/group");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    groupId: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    group: null,
    members: [],
    statsSummary: null
  },

  onLoad(options = {}) {
    this.setData({ groupId: options.groupId || "" });
    this.loadDetail(options.groupId || "");
  },

  onShow() {
    if (this.data.groupId) {
      this.loadDetail(this.data.groupId);
    }
  },

  async loadDetail(groupId) {
    if (!groupId) {
      this.setData({ pageState: PageState.ERROR, errorMessage: "缺少小组信息。" });
      return;
    }
    this.setData({ pageState: PageState.LOADING, errorMessage: "" });
    try {
      const result = await groupService.getGroupDetail({ groupId });
      const data = result.data || {};
      this.setData({
        pageState: PageState.READY,
        group: data.group,
        members: data.members || [],
        statsSummary: data.statsSummary
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "加载失败，请稍后重试。"
      });
    }
  },

  handleManage() {
    wx.navigateTo({ url: `${routes.groupManage}?groupId=${this.data.groupId}` });
  },

  handleOpenMember(event) {
    const membershipId = event.currentTarget.dataset.membershipId;
    if (membershipId) {
      wx.navigateTo({ url: `${routes.memberTargetDetail}?groupId=${this.data.groupId}&membershipId=${membershipId}` });
    }
  },

  handleRetry() {
    this.loadDetail(this.data.groupId);
  }
});
