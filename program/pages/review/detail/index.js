const reviewService = require("../../../services/review");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    archiveSnapshotId: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    archive: null,
    members: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onLoad(options = {}) {
    this.setData({ archiveSnapshotId: options.archiveSnapshotId || "" });
    this.loadDetail(options.archiveSnapshotId || "");
  },

  async loadDetail(archiveSnapshotId) {
    try {
      const result = await reviewService.getArchiveReviewDetail({ archiveSnapshotId });
      const data = result.data || {};
      this.setData({ pageState: PageState.READY, archive: data.archive, members: data.members || [], errorMessage: "" });
    } catch (error) {
      this.setData({ pageState: error.pageState || PageState.ERROR, errorMessage: error.message || "加载失败。" });
    }
  },

  handleOpenMember(event) {
    const membershipId = event.currentTarget.dataset.membershipId;
    wx.navigateTo({ url: `${routes.reviewMemberDetail}?archiveSnapshotId=${this.data.archiveSnapshotId}&membershipId=${membershipId}` });
  }
});
