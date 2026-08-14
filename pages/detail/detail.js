const api = require('../../utils/api')
const share = require('../../utils/share')

Page({
  data: {
    detail: null,
    loading: true,
    updatedText: '',
    packageRows: [],
    styleId: ''
  },

  onLoad(options) {
    share.syncShareMenu()
    if (!options.id) return
    this.setData({ styleId: options.id })
    this.load(options.id)
  },

  async load(id) {
    this.setData({ loading: true })
    try {
      const detail = await api.getStyleDetail(id)
      const pkg = detail.package || {}
      const packageRows = [
        { label: '客片标题', value: pkg.title || '' },
        { label: '拍摄场景', value: pkg.scene || '' },
        { label: '服务内容', value: pkg.service || '' },
        { label: '拍摄内容', value: pkg.shooting || '' },
        { label: '服装造型', value: pkg.clothing || '' },
        { label: '备注', value: pkg.remark || '' }
      ].filter((r) => r.value)
      this.setData({
        detail,
        packageRows,
        updatedText: detail.updatedAt ? `编辑于${detail.updatedAt}` : '',
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onPreviewSwiper(e) {
    const urls = this.data.detail.images || []
    wx.previewImage({ current: urls[e.currentTarget.dataset.index], urls })
  },

  onPreviewGallery(e) {
    const urls = this.data.detail.gallery || []
    wx.previewImage({ current: e.currentTarget.dataset.url, urls })
  },

  _shareImage() {
    const d = this.data.detail
    if (!d) return ''
    return d.cover || (d.images && d.images[0]) || d.avatar || ''
  },

  _shareTitle() {
    const d = this.data.detail
    if (!d) return '椿屿影像'
    const name = d.name || (d.package && d.package.title) || ''
    return name ? `椿屿影像 · ${name}` : '椿屿影像'
  },

  onShareAppMessage() {
    const id = this.data.styleId || (this.data.detail && this.data.detail.id) || ''
    return share.buildShareAppMessage({
      title: this._shareTitle(),
      path: id ? `/pages/detail/detail?id=${id}` : '/pages/index/index',
      imageUrl: this._shareImage()
    })
  },

  onShareTimeline() {
    const id = this.data.styleId || (this.data.detail && this.data.detail.id) || ''
    return share.buildShareTimeline({
      title: this._shareTitle(),
      query: id ? `id=${id}` : '',
      imageUrl: this._shareImage()
    })
  }
})
