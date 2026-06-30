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
    submitting: false,
    actionType: "", // 'rename' | 'exit' | 'dissolve'
    memberCount: 0,
    maxMembers: 50
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onLoad(options = {}) {
    const groupId = options.groupId || "";
    this.setData({ groupId });
    this.loadManagement(groupId);
  },

  async loadManagement(groupId = this.data.groupId) {
    if (!groupId) {
      this.setData({
        pageState: PageState.ERROR,
        errorMessage: "缺少小组信息。"
      });
      return;
    }

    this.setData({
      pageState: PageState.LOADING,
      errorMessage: ""
    });

    try {
      const result = await groupService.getGroupManagement({ groupId });
      const data = result.data || {};
      const group = data.group || null;
      const members = (data.members || []).map((m) => this.processMember(m));

      this.setData({
        pageState: PageState.READY,
        group,
        members,
        name: group ? group.name : "",
        memberCount: members.length,
        maxMembers: (group && group.maxMembers) || 50,
        errorMessage: ""
      });
    } catch (error) {
      this.setData({
        pageState: PageState.ERROR,
        errorMessage: error.message || "加载失败，请重试。"
      });
    }
  },

  processMember(member) {
    const nickname = member.nickname || "未知用户";
    return {
      ...member,
      avatarText: nickname.charAt(0),
      joinDate: this.formatDate(member.joinTime),
      hasGoal: !!member.hasGoal,
      canRemove: member.role !== "creator" && !member.isCurrentUser
    };
  },

  formatDate(timestamp) {
    if (!timestamp) return "--";
    const d = new Date(timestamp);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${month}.${day}`;
  },

  handleBack() {
    wx.navigateBack({ delta: 1 });
  },

  handleNameInput(event) {
    this.setData({
      name: event.detail.value || "",
      errorMessage: ""
    });
  },

  async handleRename() {
    const name = this.data.name.trim();
    if (!name) {
      this.setData({ errorMessage: "小组名称不能为空。" });
      return;
    }
    if (name.length > 20) {
      this.setData({ errorMessage: "小组名称需为 1 至 20 个字符。" });
      return;
    }

    this.setData({ submitting: true, actionType: "rename", errorMessage: "" });

    try {
      await groupService.updateGroupName({
        groupId: this.data.groupId,
        name
      });
      this.setData({ submitting: false, actionType: "" });
      wx.showToast({ title: "名称已更新", icon: "success" });
    } catch (error) {
      this.setData({
        submitting: false,
        actionType: "",
        errorMessage: error.message || "保存失败，请重试。"
      });
    }
  },

  handleCopyInvite() {
    const inviteCode = this.data.group && this.data.group.inviteCode;
    if (!inviteCode) {
      wx.showToast({ title: "邀请码不存在", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: inviteCode,
      success: () => {
        wx.showToast({ title: "已复制邀请码", icon: "success" });
      }
    });
  },

  confirm(title, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        confirmColor: "#ba5148",
        success: (res) => {
          resolve(res.confirm);
        }
      });
    });
  },

  async handleTransfer(event) {
    const membershipId = event.currentTarget.dataset.membershipId;
    const confirmed = await this.confirm(
      "转让创建者",
      "转让后对方将成为新的创建者，此操作不可撤销。"
    );
    if (!confirmed) return;

    this.setData({ submitting: true, errorMessage: "" });

    try {
      await groupService.transferCreator({
        groupId: this.data.groupId,
        targetMembershipId: membershipId
      });
      this.setData({ submitting: false });
      wx.showToast({ title: "转让成功", icon: "success" });
      this.loadManagement();
    } catch (error) {
      this.setData({
        submitting: false,
        errorMessage: error.message || "转让失败，请重试。"
      });
    }
  },

  async handleRemove(event) {
    const membershipId = event.currentTarget.dataset.membershipId;
    const confirmed = await this.confirm(
      "移除成员",
      "移除后该成员当前版本不可重新加入同一小组。"
    );
    if (!confirmed) return;

    this.setData({ submitting: true, errorMessage: "" });

    try {
      await groupService.removeMember({
        groupId: this.data.groupId,
        targetMembershipId: membershipId
      });
      this.setData({ submitting: false });
      wx.showToast({ title: "已移除", icon: "success" });
      this.loadManagement();
    } catch (error) {
      this.setData({
        submitting: false,
        errorMessage: error.message || "移除失败，请重试。"
      });
    }
  },

  async handleExit() {
    const confirmed = await this.confirm(
      "退出小组",
      "创建者退出前必须先转让创建者身份。确定要退出小组吗？"
    );
    if (!confirmed) return;

    this.setData({ submitting: true, actionType: "exit", errorMessage: "" });

    try {
      await groupService.exitGroup({
        groupId: this.data.groupId
      });
      this.setData({ submitting: false, actionType: "" });
      wx.showToast({ title: "已退出小组", icon: "success" });
      wx.switchTab({ url: routes.home });
    } catch (error) {
      this.setData({
        submitting: false,
        actionType: "",
        errorMessage: error.message || "退出失败，请重试。"
      });
    }
  },

  async handleDissolve() {
    const confirmed = await this.confirm(
      "解散小组",
      "解散后普通页面不可见且不可恢复，确定要解散吗？"
    );
    if (!confirmed) return;

    this.setData({ submitting: true, actionType: "dissolve", errorMessage: "" });

    try {
      await groupService.dissolveGroup({
        groupId: this.data.groupId
      });
      this.setData({ submitting: false, actionType: "" });
      wx.showToast({ title: "已解散小组", icon: "success" });
      wx.switchTab({ url: routes.home });
    } catch (error) {
      this.setData({
        submitting: false,
        actionType: "",
        errorMessage: error.message || "解散失败，请重试。"
      });
    }
  }
});
