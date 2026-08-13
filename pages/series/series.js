const api = require('../../utils/api');

Page({
	data: {
		seriesId: '',
		keyword: '',
		styleCount: 0,
		filtered: [],
	},

	onLoad(options) {
		const kw = options.keyword ? decodeURIComponent(options.keyword) : '';
		this.setData({ seriesId: options.id, keyword: kw });
		this.load(options.id, kw);
	},

	async load(seriesId, keyword) {
		try {
			const data = await api.getStylesBySeries(seriesId, keyword);
			wx.setNavigationBarTitle({
				title: (data.series && data.series.name) || '椿屿影像',
			});
			this.setData({
				filtered: data.styles || [],
				styles: data.styles || [],
				styleCount: data.styleCount || 0,
			});
		} catch (e) {
			wx.showToast({ title: e.message || '加载失败', icon: 'none' });
		}
	},

	/** app.onShow 静默刷新到新数据后回调 */
	onContentUpdated() {
		this.load(this.data.seriesId, this.data.keyword);
	},

	onKeywordInput(e) {
		this.setData({ keyword: e.detail.value });
	},

	onSearch() {
		const kw = this.data.keyword.trim();
		const filtered = kw
			? (this.data.styles || []).filter((s) => s.name.includes(kw))
			: this.data.styles || [];
		this.setData({ filtered });
		if (kw && !filtered.length)
			wx.showToast({ title: '未找到相关样式', icon: 'none' });
	},

	onImageSearch() {
		wx.showToast({ title: '图片搜索功能开发中', icon: 'none' });
	},

	onStyleTap(e) {
		wx.navigateTo({
			url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}`,
		});
	},
});
