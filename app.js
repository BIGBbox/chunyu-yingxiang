App({
	onLaunch() {
		const cosUtil = require('./utils/cos');
		this.globalData.baseUrl = cosUtil.getBaseUrl();
	},

	onShow() {
		// 回到前台时静默拉一次线上内容：热启动不再停留在旧数据
		const api = require('./utils/api');
		api.refreshInBackground(() => {
			const pages = getCurrentPages();
			pages.forEach((page) => {
				if (page && typeof page.onContentUpdated === 'function') {
					page.onContentUpdated();
				}
			});
		});
	},

	globalData: {
		storeName: '椿屿影像',
		baseUrl: '',
		content: null,
	},
});
