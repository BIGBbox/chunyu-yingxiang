const api = require('../../utils/api')

Page({
  data: { store: { city: '', address: '', guidance: [], environment: [] } },

  onLoad() {
    this.load()
  },

  async load() {
    try {
      const store = await api.getStore({ display: true })
      this.setData({ store })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  /** app.onShow 静默刷新到新数据后回调 */
  onContentUpdated() {
    this.load()
  },

  onCopyAddress() {
    const address = this.data.store.address
    if (!address) {
      wx.showToast({ title: '暂无地址', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: address })
  },

  onPreviewEnv(e) {
    wx.previewImage({
      current: e.currentTarget.dataset.url,
      urls: this.data.store.environment || []
    })
  }
})
