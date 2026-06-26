const groupService = require("../../../services/group");
const { routes } = require("../../../config/routes");

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
    submitting: false,
    errorMessage: "",
    createdGroup: null,
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

  async handleCreate() {
    const name = this.data.name.trim();
    if (!name || name.length > 20) {
      this.setData({ errorMessage: "小组名称需为 1 至 20 个字符。" });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await groupService.createGroup({
        groupType: this.data.groupType,
        name,
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

  // 微信群分享
  handleShareToChat() {
    const group = this.data.createdGroup;
    if (!group) return;

    // 如果用户已在成功页点击了分享，触发转发
    wx.showModal({
      title: '分享到微信群',
      content: `即将分享「${group.name}」的邀请码：${group.inviteCode}`,
      confirmText: '去分享',
      success: (res) => {
        if (res.confirm) {
          // 触发系统分享（需要配合 onShareAppMessage）
          // 小程序会自动调起分享面板
        }
      }
    });
  },

  // 复制邀请码
  handleCopyCode() {
    const code = this.data.createdGroup && this.data.createdGroup.inviteCode;
    if (code) {
      wx.setClipboardData({
        data: code,
        success: () => {
          wx.showToast({ title: '已复制邀请码', icon: 'success' });
        }
      });
    }
  },

  onShareAppMessage() {
    const group = this.data.createdGroup;
    return {
      title: group ? `邀请你加入「${group.name}」` : '加入我的运动小组',
      path: `/pages/group/join/index?code=${group ? group.inviteCode : ''}`,
      imageUrl: ''
    };
  }
});
