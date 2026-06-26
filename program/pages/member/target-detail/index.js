const targetService = require("../../../services/target");
const { PageState } = require("../../../config/page-states");

Page({
  data: {
    groupId: "",
    membershipId: "",
    pageState: PageState.LOADING,
    errorMessage: "",
    memberStats: null
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/home/index/index" }) });
  },

  onLoad(options = {}) {
    this.setData({
      groupId: options.groupId || "",
      membershipId: options.membershipId || ""
    });
    this.loadDetail();
  },

  async loadDetail() {
    const { groupId, membershipId } = this.data;
    if (!groupId || !membershipId) {
      this.setData({ pageState: PageState.ERROR, errorMessage: "缺少成员信息。" });
      return;
    }

    try {
      const result = await targetService.getMemberTargetDetail({ groupId, membershipId });
      const memberStats = result.data && result.data.memberStats;

      if (!memberStats) {
        this.setData({ pageState: PageState.ERROR, errorMessage: "未找到成员信息。" });
        return;
      }

      // 预计算所有显示数据
      const processedData = this.processMemberStats(memberStats);

      this.setData({
        pageState: PageState.READY,
        memberStats: processedData,
        errorMessage: ""
      });
    } catch (error) {
      this.setData({
        pageState: error.pageState || PageState.ERROR,
        errorMessage: error.message || "加载失败。"
      });
    }
  },

  /**
   * 预计算成员统计数据，避免 WXML 中使用 indexOf
   */
  processMemberStats(stats) {
    const processed = { ...stats };

    // 计算状态相关样式和文本
    const isCompleted = stats.completed;
    const hasTargets = stats.targetProgressList && stats.targetProgressList.length > 0;

    // 状态徽章
    if (isCompleted) {
      processed.statusText = "已完成";
      processed.statusClass = "status-completed";
    } else if (!hasTargets) {
      processed.statusText = "未设置";
      processed.statusClass = "status-not-started";
    } else {
      processed.statusText = "进行中";
      processed.statusClass = "status-ongoing";
    }

    // 角色标签
    if (stats.role === 'creator') {
      processed.roleText = "创建者";
      processed.roleTagClass = "creator";
    } else {
      processed.roleText = "成员";
      processed.roleTagClass = "member";
    }

    // 目标描述
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月',
                        '七月', '八月', '九月', '十月', '十一月', '十二月'];
    const monthName = stats.targetMonth ? monthNames[parseInt(stats.targetMonth) - 1] : '';
    const completedDate = stats.completedAt ? this.formatDate(stats.completedAt) : '';

    if (isCompleted && completedDate) {
      processed.targetDesc = `${stats.nickname} · ${stats.targetYear || ''}.${stats.targetMonth || ''} · 已于 ${completedDate} 完成月度目标`;
    } else if (stats.targetName) {
      processed.targetDesc = `${stats.nickname} · ${stats.targetYear || ''}.${stats.targetMonth || ''}`;
    } else {
      processed.targetDesc = `${stats.nickname}`;
    }

    // 整体状态标签
    if (isCompleted) {
      processed.overallStatusText = "已完成";
      processed.overallTagClass = "good";
    } else if (!hasTargets) {
      processed.overallStatusText = "未设置";
      processed.overallTagClass = "mute";
    } else {
      const progress = stats.overallProgress || 0;
      processed.overallStatusText = `${progress}%`;
      processed.overallTagClass = progress >= 50 ? "soft" : "mute";
    }

    // 处理目标进度列表
    if (stats.targetProgressList && stats.targetProgressList.length > 0) {
      processed.targetProgressList = stats.targetProgressList.map(item => {
        const progressItem = { ...item };

        // 预计算显示文本
        progressItem.goalTypeText = this.getGoalTypeText(item.goalType);

        // 进度文本
        switch (item.goalType) {
          case 'duration':
            progressItem.progressText = `${item.doneValue} / ${item.targetValue} 小时`;
            break;
          case 'calories':
            progressItem.progressText = `${item.doneValue} / ${item.targetValue}`;
            break;
          default:
            progressItem.progressText = `${item.doneValue} / ${item.targetValue}`;
        }

        // 达成描述
        if (item.achievedAt) {
          const achievedDate = this.formatDate(item.achievedAt);
          const extraInfo = item.extra || '';
          progressItem.achievedDesc = `${achievedDate} 达成${extraInfo ? '，' + extraInfo : ''}。`;
        } else if (item.progress >= 100) {
          progressItem.achievedDesc = "已达成。";
        } else {
          progressItem.achievedDesc = "";
        }

        return progressItem;
      });
    }

    // 处理最近打卡记录
    if (stats.recentRecords && stats.recentRecords.length > 0) {
      processed.recentRecords = stats.recentRecords.map(record => {
        const recordItem = { ...record };

        // 日期文本
        recordItem.dateText = this.formatDate(record.date, true);

        // 热量文本
        if (record.isMakeup) {
          recordItem.calorieText = "补卡";
        } else {
          recordItem.calorieText = `${record.calorie || 0} kcal`;
        }

        // 记录描述
        const descParts = [];
        if (record.duration) {
          descParts.push(`${record.duration} 分钟`);
        }
        if (record.tripleRing) {
          descParts.push("三环闭合");
        }
        if (record.photoCount > 0) {
          descParts.push(`${record.photoCount} 张照片`);
        }
        recordItem.recordDesc = descParts.join(" · ");

        return recordItem;
      });
    }

    return processed;
  },

  /**
   * 获取目标类型的中文文本
   */
  getGoalTypeText(goalType) {
    const typeMap = {
      'calories': '月总最低热量',
      'duration': '运动时长',
      'days': '运动天数',
      'sessions': '运动次数',
      'triple_ring': '三环闭合'
    };
    return typeMap[goalType] || goalType;
  },

  /**
   * 格式化日期
   * @param {string} dateStr - 日期字符串
   * @param {boolean} short - 是否使用短格式（M.DD）
   * @returns {string} 格式化后的日期
   */
  formatDate(dateStr, short = false) {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    if (short) {
      return `${month}.${day < 10 ? '0' + day : day}`;
    }

    return `${year}.${month < 10 ? '0' + month : month}.${day < 10 ? '0' + day : day}`;
  }
});
