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
    statsSummary: null,
    myTargetStatus: "" // 'unset' | 'set' | ''
  },

  onLoad(options = {}) {
    this.setData({ groupId: options.groupId || "" });
    this.loadDetail(options.groupId || "");
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    if (this.data.groupId) {
      this.loadDetail(this.data.groupId);
    }
  },

  async loadDetail(groupId) {
    if (!groupId) {
      this.setData({ pageState: PageState.ERROR, errorMessage: "缺少小组信息。" });
      return;
    }
    this.setData({ pageState: PageState.LOADING, errorMessage: "" });
    try {
      const result = await groupService.getGroupDetail({ groupId });
      const data = result.data || {};
      const group = data.group || {};
      const members = data.members || [];
      const currentMembershipId = (data.currentMembership || {}).membershipId || "";

      // 从成员列表里找到当前用户，判断目标状态
      let myTargetStatus = "";
      if (currentMembershipId) {
        const me = members.find((m) => m.membershipId === currentMembershipId);
        if (me && me.targetSummary) {
          myTargetStatus = me.targetSummary.status === "unset" ? "unset" : "set";
        } else {
          myTargetStatus = "unset";
        }
      }

      // 格式化日期字段（API 返回 lifecycleStartAt/lifecycleEndAt）
      const fmtDate = (raw) => {
        if (!raw) return "";
        const d = new Date(raw);
        if (isNaN(d.getTime())) return String(raw);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
      };

      this.setData({
        pageState: PageState.READY,
        group: {
          ...group,
          startDate: fmtDate(group.lifecycleStartAt),
          endDate: fmtDate(group.lifecycleEndAt)
        },
        members,
        statsSummary: data.statsSummary,
        myTargetStatus
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "加载失败，请稍后重试。"
      });
    }
  },

  handleSetTarget() {
    wx.navigateTo({ url: `${routes.targetTypes}?groupId=${this.data.groupId}` });
  },

  handleManage() {
    wx.navigateTo({ url: `${routes.groupManage}?groupId=${this.data.groupId}` });
  },

  handleOpenMember(event) {
    const membershipId = event.currentTarget.dataset.membershipId;
    if (membershipId) {
      wx.navigateTo({ url: `${routes.memberTargetDetail}?groupId=${this.data.groupId}&membershipId=${membershipId}` });
    }
  },

  handleRetry() {
    this.loadDetail(this.data.groupId);
  }
});
