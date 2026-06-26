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
    name: "",
    submitting: false
  },

  onLoad(options = {}) {
    this.setData({ groupId: options.groupId || "" });
    this.loadManagement(options.groupId || "");
  },

  async loadManagement(groupId = this.data.groupId) {
    if (!groupId) {
      this.setData({ pageState: PageState.ERROR, errorMessage: "缺少小组信息。" });
      return;
    }
    try {
      const result = await groupService.getGroupManagement({ groupId });
      const data = result.data || {};
      this.setData({
        pageState: PageState.READY,
        group: data.group,
        members: data.members || [],
        name: data.group ? data.group.name : "",
        errorMessage: ""
      });
    } catch (error) {
      this.setData({ pageState: error.pageState || PageState.ERROR, errorMessage: error.message || "加载失败。" });
    }
  },

  handleNameInput(event) {
    this.setData({ name: event.detail.value || "", errorMessage: "" });
  },

  async handleRename() {
    const name = this.data.name.trim();
    if (!name || name.length > 20) {
      this.setData({ errorMessage: "小组名称需为 1 至 20 个字符。" });
      return;
    }
    await this.runAction(() => groupService.updateGroupName({ groupId: this.data.groupId, name }, { loadingText: "保存中" }), true);
  },

  handleCopyInvite() {
    const inviteCode = this.data.group && this.data.group.inviteCode;
    if (inviteCode) {
      wx.setClipboardData({ data: inviteCode });
    }
  },

  confirm(title, content, next) {
    wx.showModal({
      title,
      content,
      confirmColor: "#ba5148",
      success: (res) => {
        if (res.confirm) {
          next();
        }
      }
    });
  },

  async runAction(action, reload = false) {
    this.setData({ submitting: true, errorMessage: "" });
    try {
      await action();
      this.setData({ submitting: false });
      if (reload) {
        this.loadManagement();
      }
    } catch (error) {
      this.setData({ submitting: false, errorMessage: error.message || "操作失败。" });
    }
  },

  handleTransfer(event) {
    const membershipId = event.currentTarget.dataset.membershipId;
    this.confirm("转让创建者", "转让后对方将成为新的创建者。", () => {
      this.runAction(() => groupService.transferCreator({ groupId: this.data.groupId, targetMembershipId: membershipId }, { loadingText: "转让中" }), true);
    });
  },

  handleRemove(event) {
    const membershipId = event.currentTarget.dataset.membershipId;
    this.confirm("移除成员", "移除后该成员当前版本不可重新加入同一小组。", () => {
      this.runAction(() => groupService.removeMember({ groupId: this.data.groupId, targetMembershipId: membershipId }, { loadingText: "移除中" }), true);
    });
  },

  handleExit() {
    this.confirm("退出小组", "创建者退出前必须先转让身份。", () => {
      this.runAction(async () => {
        await groupService.exitGroup({ groupId: this.data.groupId }, { loadingText: "退出中" });
        wx.redirectTo({ url: routes.home });
      });
    });
  },

  handleDissolve() {
    this.confirm("解散小组", "解散后普通页面不可见且不可恢复。", () => {
      this.runAction(async () => {
        await groupService.dissolveGroup({ groupId: this.data.groupId }, { loadingText: "解散中" });
        wx.redirectTo({ url: routes.home });
      });
    });
  }
});
