const groupService = require("../../../services/group");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

function getCurrentMonthLabel() {
  const now = new Date();
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`;
}

Page({
  data: {
    pageState: PageState.LOADING,
    errorMessage: "",
    groups: [],
    selectedGroupId: "",
    currentMonthLabel: getCurrentMonthLabel()
  },

  onShow() {
    // 设置自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
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
    const groupId = event.currentTarget.dataset.groupId || "";
    const groupName = event.currentTarget.dataset.groupName || "";
    if (!groupId) return;

    this.setData({ selectedGroupId: groupId });
    wx.navigateTo({
      url: `${routes.myTargetDetail}?groupId=${groupId}&groupName=${encodeURIComponent(groupName)}`,
      fail(error) {
        console.error("[me] navigate to target detail failed", error);
        wx.showToast({ title: "目标详情打开失败", icon: "none" });
      }
    });
  },

  handleOpenDetail() {
    if (this.data.selectedGroupId) {
      wx.navigateTo({ url: `${routes.myTargetDetail}?groupId=${this.data.selectedGroupId}` });
    }
  }
});
