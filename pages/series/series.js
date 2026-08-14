const api = require('../../utils/api')
const share = require('../../utils/share')

Page({
  data: {
    seriesId: '',
    keyword: '',
    styleCount: 0,
    filtered: [],
    seriesName: '',
    shareCover: ''
  },

  onLoad(options) {
    share.syncShareMenu()
    const kw = options.keyword ? decodeURIComponent(options.keyword) : ''
    this.setData({ seriesId: options.id, keyword: kw })
    this.load(options.id, kw)
  },

  async load(seriesId, keyword) {
    try {
      const data = await api.getStylesBySeries(seriesId, keyword)
      const seriesName = (data.series && data.series.name) || '椿屿影像'
      const styles = data.styles || []
      wx.setNavigationBarTitle({ title: seriesName })
      this.setData({
        filtered: styles,
        styles,
        styleCount: data.styleCount || 0,
        seriesName,
        shareCover: (data.series && data.series.cover) || (styles[0] && styles[0].cover) || ''
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  /** app.onShow 静默刷新到新数据后回调 */
  onContentUpdated() {
    this.load(this.data.seriesId, this.data.keyword)
    share.syncShareMenu()
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    const kw = this.data.keyword.trim()
    const filtered = kw
      ? (this.data.styles || []).filter((s) => s.name.includes(kw))
      : this.data.styles || []
    this.setData({ filtered })
    if (kw && !filtered.length) wx.showToast({ title: '未找到相关样式', icon: 'none' })
  },

  onImageSearch() {
    wx.showToast({ title: '图片搜索功能开发中', icon: 'none' })
  },

  onStyleTap(e) {
    wx.navigateTo({
      url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}`
    })
  },

  onShareAppMessage() {
    const id = this.data.seriesId || ''
    const title = this.data.seriesName
      ? `椿屿影像 · ${this.data.seriesName}`
      : '椿屿影像'
    return share.buildShareAppMessage({
      title,
      path: id ? `/pages/series/series?id=${id}` : '/pages/index/index',
      imageUrl: this.data.shareCover
    })
  },

  onShareTimeline() {
    const id = this.data.seriesId || ''
    const title = this.data.seriesName
      ? `椿屿影像 · ${this.data.seriesName}`
      : '椿屿影像'
    return share.buildShareTimeline({
      title,
      query: id ? `id=${id}` : '',
      imageUrl: this.data.shareCover
    })
  }
})
