const groupService = require("../../../services/group");
const { routes } = require("../../../config/routes");
const privacyUtils = require("../../../utils/privacy");

// 计算当前月和下月的日期标签
function getMonthInfo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based

  // 当前月
  const cm = String(month + 1).padStart(2, '0');
  const currentMonthLabel = `${year}.${cm}`;
  const lastDayCurrent = new Date(year, month + 1, 0).getDate();
  const currentMonthRange = `${cm}.01 - ${cm}.${lastDayCurrent}\n创建后立即进入进行中`;

  // 下个月
  const nm = String(month + 2).padStart(2, '0');
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonthLabel = `${nextYear}.${nm}`;
  const lastDayNext = new Date(nextYear, (month + 2) % 12 || 12, 0).getDate();
  const nextMonthRange = `${nm}.01 - ${nm}.${lastDayNext}\n可先邀请和设置目标`;

  return { currentMonthLabel, currentMonthRange, nextMonthLabel, nextMonthRange };
}

const monthInfo = getMonthInfo();

Page({
  data: {
    groupType: "currentMonth",
    name: "",
    nickname: "",
    submitting: false,
    errorMessage: "",
    createdGroup: null,
    showClipboardPrivacyDialog: false,
    // 动态日期显示
    currentMonthLabel: monthInfo.currentMonthLabel,
    currentMonthRange: monthInfo.currentMonthRange,
    nextMonthLabel: monthInfo.nextMonthLabel,
    nextMonthRange: monthInfo.nextMonthRange
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/index/index' }) });
  },

  onShow() {
    // 设置自定义 tabBar 选中状态（非 tab 页面，默认选中第一个 tab）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
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

  handleNicknameInput(event) {
    this.setData({
      nickname: event.detail.value || "",
      errorMessage: ""
    });
  },

  async handleCreate() {
    const name = this.data.name.trim();
    const nickname = this.data.nickname.trim();
    if (!name || name.length > 20) {
      this.setData({ errorMessage: "小组名称需为 1 至 20 个字符。" });
      return;
    }
    if (!nickname || nickname.length > 12) {
      this.setData({ errorMessage: "昵称需为 1 至 12 个字符。" });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await groupService.createGroup({
        groupType: this.data.groupType,
        name,
        nickname,
        requestId
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
  },

  handleSetTarget() {
    const groupId = this.data.createdGroup && this.data.createdGroup.groupId;
    if (groupId) {
      wx.redirectTo({ url: `${routes.targetTypes}?groupId=${groupId}` });
    }
  },

  // 复制邀请码
  async handleCopyCode() {
    const code = String(
      (this.data.createdGroup && this.data.createdGroup.inviteCode) || ""
    ).trim();

    if (!code) {
      wx.showToast({ title: "邀请码为空，请刷新后重试", icon: "none" });
      return;
    }

    try {
      privacyUtils.setPrivacyPromptHandler(() => {
        this.setData({ showClipboardPrivacyDialog: true });
      });
      await privacyUtils.copyText(code);
      wx.showToast({ title: "邀请码已复制", icon: "success" });
    } catch (error) {
      console.error("[group/create] copy invite code failed", {
        inviteCode: code,
        errMsg: error && error.errMsg ? error.errMsg : ""
      });
      wx.showToast({ title: "复制失败，请稍后重试", icon: "none" });
    }
  },

  handleAgreeClipboardPrivacy() {
    privacyUtils.markPrivacyAuthorized();
    privacyUtils.resolvePrivacyAuthorization(true);
    this.setData({ showClipboardPrivacyDialog: false });
  },

  handleCancelClipboardPrivacy() {
    privacyUtils.resolvePrivacyAuthorization(false);
    this.setData({ showClipboardPrivacyDialog: false });
  },

  handleOpenPrivacyContract() {
    privacyUtils.openPrivacyContract();
  },

  onShareAppMessage() {
    const group = this.data.createdGroup;
    return {
      title: group ? `邀请你加入「${group.name}」` : '加入我的运动小组',
      path: `/pages/group/join/index?inviteCode=${group ? group.inviteCode : ''}`,
      imageUrl: ''
    };
  }
});
