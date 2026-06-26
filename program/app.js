App({
  globalData: {
    userInfo: null
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        traceUser: true
      });
    }
  }
});
