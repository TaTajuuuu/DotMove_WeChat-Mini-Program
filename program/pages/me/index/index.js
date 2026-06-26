const groupService = require("../../../services/group");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    pageState: PageState.LOADING,
    errorMessage: "",
    groups: [],
    selectedGroupId: ""
  },

  onShow() {
    this.loadHome();
  },

  async loadHome() {
    try {
      const result = await groupService.getHomeEntry();
      const groups = (result.data && result.data.currentGroups) || [];
      this.setData({
        pageState: groups.length ? PageState.READY : PageState.EMPTY,
        groups,
        selectedGroupId: this.data.selectedGroupId || (groups[0] && groups[0].groupId) || "",
        errorMessage: ""
      });
    } catch (error) {
      this.setData({ pageState: error.pageState || PageState.ERROR, errorMessage: error.message || "加载失败。" });
    }
  },

  handleSelectGroup(event) {
    this.setData({ selectedGroupId: event.currentTarget.dataset.groupId });
  },

  handleOpenDetail() {
    if (this.data.selectedGroupId) {
      wx.navigateTo({ url: `${routes.myTargetDetail}?groupId=${this.data.selectedGroupId}` });
    }
  }
});
