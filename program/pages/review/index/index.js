const reviewService = require("../../../services/review");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    pageState: PageState.LOADING,
    errorMessage: "",
    archives: []
  },

  onShow() {
    // 设置自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.loadArchives();
  },

  async loadArchives() {
    try {
      const result = await reviewService.getReviewHome();
      const archives = (result.data && result.data.archives) || [];
      this.setData({ pageState: archives.length ? PageState.READY : PageState.EMPTY, archives, errorMessage: "" });
    } catch (error) {
      this.setData({ pageState: error.pageState || PageState.ERROR, errorMessage: error.message || "加载失败。" });
    }
  },

  handleOpenArchive(event) {
    const archiveSnapshotId = event.currentTarget.dataset.archiveId;
    wx.navigateTo({ url: `${routes.reviewDetail}?archiveSnapshotId=${archiveSnapshotId}` });
  }
});
