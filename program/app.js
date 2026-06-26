const authService = require("./services/auth");

App({
  globalData: {
    userInfo: null,
    loginPromise: null  // 登录 Promise，防止重复登录
  },

  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d5gpb0hmce7c93793',
        traceUser: true
      });
    }

    // 自动登录（静默）
    this.autoLogin();
  },

  /**
   * 自动登录：调用云函数 loginOrCreateUser
   * 创建或获取当前微信用户，将结果存到 globalData
   */
  async autoLogin() {
    // 防止并发重复登录
    if (this.globalData.loginPromise) {
      return this.globalData.loginPromise;
    }

    const loginTask = (async () => {
      try {
        console.log('[App] 开始自动登录...');
        const result = await authService.loginOrCreateUser();
        const user = result.data && result.data.user;
        if (user) {
          this.globalData.userInfo = user;
          console.log('[App] 登录成功:', user.profileNickname || user.userId);
        } else {
          console.warn('[App] 登录成功但未返回用户信息');
        }
        return user;
      } catch (error) {
        console.error('[App] 自动登录失败:', error);
        return null;
      }
    })();

    this.globalData.loginPromise = loginTask;

    try {
      return await loginTask;
    } catch (e) {
      return null;
    }
  },

  /**
   * 获取当前登录用户信息（等待登录完成）
   */
  async getLoggedInUser() {
    // 如果已经有用户信息，直接返回
    if (this.globalData.userInfo) {
      return this.globalData.userInfo;
    }

    // 等待登录完成
    const user = await this.autoLogin();
    return user;
  }
});
