const checkinService = require("../../../services/checkin");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    groupId: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    records: []
  },

  onLoad(options = {}) {
    this.setData({ groupId: options.groupId || "" });
    this.loadRecords(options.groupId || "");
  },

  async loadRecords(groupId = this.data.groupId) {
    if (!groupId) {
      this.setData({ pageState: PageState.ERROR, errorMessage: "缺少小组信息。" });
      return;
    }
    try {
      const result = await checkinService.getCheckinRecords({ groupId });
      const records = (result.data && result.data.records) || [];
      this.setData({
        pageState: records.length ? PageState.READY : PageState.EMPTY,
        records,
        errorMessage: ""
      });
    } catch (error) {
      this.setData({ pageState: error.pageState || PageState.ERROR, errorMessage: error.message || "加载失败。" });
    }
  }
});
