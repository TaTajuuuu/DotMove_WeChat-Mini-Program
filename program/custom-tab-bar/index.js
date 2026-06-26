Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/home/index/index",
        text: "小组",
        iconPath: "/images/tab-icons/tab-group.png",
        selectedIconPath: "/images/tab-icons/tab-group-active.png"
      },
      {
        pagePath: "/pages/checkin/create/index",
        text: "打卡",
        iconPath: "/images/tab-icons/tab-checkin.png",
        selectedIconPath: "/images/tab-icons/tab-checkin-active.png"
      },
      {
        pagePath: "/pages/me/index/index",
        text: "我的",
        iconPath: "/images/tab-icons/tab-me.png",
        selectedIconPath: "/images/tab-icons/tab-me-active.png"
      },
      {
        pagePath: "/pages/review/index/index",
        text: "回顾",
        iconPath: "/images/tab-icons/tab-review.png",
        selectedIconPath: "/images/tab-icons/tab-review-active.png"
      }
    ]
  },
  attached() {
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url });
    }
  }
});
