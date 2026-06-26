const groupService = require("../../../services/group");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    pageState: PageState.LOADING,
    errorMessage: "",
    currentGroups: [],
    archiveSummaries: [],
    inviteCode: ""
  },

  onLoad() {
    this.loadHomeEntry();
  },

  onShow() {
    this.loadHomeEntry();
  },

  async loadHomeEntry() {
    this.setData({
      pageState: PageState.LOADING,
      errorMessage: ""
    });

    try {
      const result = await groupService.getHomeEntry();
      const data = result.data || {};
      const currentGroups = data.currentGroups || [];

      this.setData({
        pageState: currentGroups.length ? PageState.READY : PageState.EMPTY,
        currentGroups,
        archiveSummaries: data.archiveSummaries || []
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "加载失败，请稍后重试。"
      });
    }
  },

  handleInviteInput(event) {
    this.setData({
      inviteCode: (event.detail.value || "").trim()
    });
  },

  handleCreateGroup() {
    wx.navigateTo({ url: routes.groupCreate });
  },

  handleJoinGroup() {
    const inviteCode = this.data.inviteCode;
    const query = inviteCode ? `?inviteCode=${encodeURIComponent(inviteCode)}` : "";
    wx.navigateTo({ url: `${routes.groupJoin}${query}` });
  },

  handleOpenGroup(event) {
    const groupId = event.currentTarget.dataset.groupId;
    if (groupId) {
      wx.navigateTo({ url: `${routes.groupDetail}?groupId=${groupId}` });
    }
  },

  handleOpenArchive(event) {
    const archiveSnapshotId = event.currentTarget.dataset.archiveId;
    if (archiveSnapshotId) {
      wx.navigateTo({ url: `${routes.reviewDetail}?archiveSnapshotId=${archiveSnapshotId}` });
    }
  },

  handleRetry() {
    this.loadHomeEntry();
  }
});
