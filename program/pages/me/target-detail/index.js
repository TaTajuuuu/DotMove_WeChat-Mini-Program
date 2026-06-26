const targetService = require("../../../services/target");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    groupId: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    memberStats: null
  },

  onLoad(options = {}) {
    this.setData({ groupId: options.groupId || "" });
    this.loadDetail(options.groupId || "");
  },

  async loadDetail(groupId) {
    try {
      const result = await targetService.getMyTargetDetail({ groupId });
      this.setData({
        pageState: PageState.READY,
        memberStats: result.data && result.data.memberStats,
        errorMessage: ""
      });
    } catch (error) {
      this.setData({ pageState: error.pageState || PageState.ERROR, errorMessage: error.message || "加载失败。" });
    }
  },

  handleOpenRecords() {
    wx.navigateTo({ url: `${routes.checkinRecords}?groupId=${this.data.groupId}` });
  }
});
