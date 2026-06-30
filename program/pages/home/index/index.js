const groupService = require("../../../services/group");
const { routes } = require("../../../config/routes");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    pageState: PageState.LOADING,
    errorMessage: "",
    activeGroups: [],
    upcomingGroups: [],
    inviteCode: "",
    showJoinModal: false,
    joinErrorMessage: "",

    // Hero 数据
    monthName: "",
    currentMonth: "",
    checkinAvailableCount: 0
  },

  onLoad() {
    this.initMonthInfo();
    this.loadWithLogin();
  },

  onShow() {
    // 设置自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.loadWithLogin();
  },

  // 初始化月份信息（Hero 区域）
  initMonthInfo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const monthNames = ['', '一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月'];

    this.setData({
      monthName: monthNames[month],
      currentMonth: `${year}.${String(month).padStart(2, '0')}`
    });
  },

  async loadWithLogin() {
    const app = getApp();

    try {
      const user = await app.getLoggedInUser();
      if (!user) {
        console.warn('[Home] 用户未登录');
      }
    } catch (e) {
      console.error('[Home] 等待登录异常:', e);
    }

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
      const allGroups = data.currentGroups || [];

      // 按状态分组：active 和 upcoming
      const activeGroups = [];
      const upcomingGroups = [];

      let checkinCount = 0;

      for (const g of allGroups) {
        const card = this.transformGroupCard(g);
        if (g.status === 'active') {
          activeGroups.push(card);
          checkinCount++;
        } else if (g.status === 'upcoming') {
          upcomingGroups.push(card);
        }
      }

      const hasContent = activeGroups.length > 0 || upcomingGroups.length > 0;

      this.setData({
        pageState: hasContent ? PageState.READY : PageState.EMPTY,
        activeGroups,
        upcomingGroups,
        checkinAvailableCount: checkinCount || 'x'
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "加载失败，请稍后重试。"
      });
    }
  },

  // 将后端数据转换为原型图卡片格式
  transformGroupCard(group) {
    // 格式化日期范围
    let dateRange = '';
    if (group.startDate && group.endDate) {
      const fmt = (d) => {
        const dt = new Date(d);
        return `${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
      };
      dateRange = `${fmt(group.startDate)} - ${fmt(group.endDate)}`;
    }

    // 构建头像列表（最多显示 3 个）
    const avatarList = [];
    if (group.activeMemberCount && group.activeMemberCount > 0) {
      avatarList.push({ type: '', text: '我' });
      if (group.activeMemberCount > 1) {
        avatarList.push({ type: 'alt', text: '友' });
      }
      if (group.activeMemberCount > 2) {
        avatarList.push({ type: 'mute', text: '+' + (group.activeMemberCount - 2) });
      }
    }

    // 目标是否已设置
    const hasTarget = group.targetSummary &&
      group.targetSummary.status !== 'unset';

    // 进度百分比（仅进行中小组有）
    const progress = group.progress !== undefined
      ? Math.round(group.progress)
      : undefined;

    return {
      groupId: group.groupId,
      name: group.name,
      status: group.status,
      dateRange: dateRange,
      activeMemberCount: group.activeMemberCount || 0,
      maxMembers: group.maxMembers || 0,
      hasTarget: hasTarget,
      progress: progress,
      avatarList: avatarList,
      targetSummary: group.targetSummary
    };
  },

  handleInviteInput(event) {
    this.setData({
      inviteCode: (event.detail.value || "").replace(/\s+/g, "").toUpperCase(),
      joinErrorMessage: ""
    });
  },

  handleCreateGroup() {
    wx.navigateTo({ url: routes.groupCreate });
  },

  handleJoinGroup() {
    const inviteCode = String(this.data.inviteCode || "").trim().toUpperCase();
    if (!/^[A-Z2-9]{6,12}$/.test(inviteCode)) {
      this.setData({ joinErrorMessage: "请输入 6 至 12 位有效邀请码。" });
      return;
    }

    wx.navigateTo({
      url: `${routes.groupJoin}?inviteCode=${encodeURIComponent(inviteCode)}`,
      success: () => this.setData({ showJoinModal: false, joinErrorMessage: "" }),
      fail: (error) => {
        console.error("[Home] open join page failed", error);
        this.setData({ joinErrorMessage: "加入页面打开失败，请重试。" });
      }
    });
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
    this.loadWithLogin();
  },

  handleShowJoinModal() {
    this.setData({ showJoinModal: true, joinErrorMessage: "" });
  },

  handleHideJoinModal() {
    this.setData({ showJoinModal: false, joinErrorMessage: "" });
  },

  handleModalContentTap() {
    // 阻止弹窗内部点击冒泡到遮罩层。
  }
});
