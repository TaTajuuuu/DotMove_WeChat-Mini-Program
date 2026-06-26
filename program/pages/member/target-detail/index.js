const targetService = require("../../../services/target");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    groupId: "",
    membershipId: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    memberStats: null
  },

  onLoad(options = {}) {
    this.setData({
      groupId: options.groupId || "",
      membershipId: options.membershipId || ""
    });
    this.loadDetail();
  },

  async loadDetail() {
    const { groupId, membershipId } = this.data;
    if (!groupId || !membershipId) {
      this.setData({ pageState: PageState.ERROR, errorMessage: "缺少成员信息。" });
      return;
    }

    try {
      const result = await targetService.getMemberTargetDetail({ groupId, membershipId });
      this.setData({
        pageState: PageState.READY,
        memberStats: result.data && result.data.memberStats,
        errorMessage: ""
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "加载失败。"
      });
    }
  }
});
