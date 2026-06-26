const groupService = require("../../../services/group");
const { routes } = require("../../../config/routes");

Page({
  data: {
    groupType: "currentMonth",
    name: "",
    submitting: false,
    errorMessage: "",
    createdGroup: null
  },

  handleTypeChange(event) {
    this.setData({
      groupType: event.currentTarget.dataset.type,
      errorMessage: ""
    });
  },

  handleNameInput(event) {
    this.setData({
      name: event.detail.value || "",
      errorMessage: ""
    });
  },

  async handleCreate() {
    const name = this.data.name.trim();
    if (!name || name.length > 20) {
      this.setData({ errorMessage: "小组名称需为 1 至 20 个字符。" });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    try {
      const result = await groupService.createGroup({
        groupType: this.data.groupType,
        name
      }, { loadingText: "创建中" });

      this.setData({
        createdGroup: result.data,
        submitting: false
      });
    } catch (error) {
      this.setData({
        submitting: false,
        errorMessage: error.message || "创建失败，请稍后重试。"
      });
    }
  },

  handleOpenGroup() {
    const groupId = this.data.createdGroup && this.data.createdGroup.groupId;
    if (groupId) {
      wx.redirectTo({ url: `${routes.groupDetail}?groupId=${groupId}` });
    }
  }
});
