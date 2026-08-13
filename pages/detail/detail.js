const api = require('../../utils/api')

Page({
  data: {
    detail: null,
    loading: true,
    updatedText: '',
    packageRows: []
  },

  onLoad(options) {
    if (!options.id) return
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
  }
})
