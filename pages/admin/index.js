const cosUtil = require('../../utils/cos')
const api = require('../../utils/api')
const admin = require('../../utils/admin')

function switchOn(e) {
  const v = e && e.detail ? e.detail.value : false
  return v === true || v === 'true' || v === 1 || v === '1'
}

Page({
  data: {
    watermarkEnabled: false,
    shareEnabled: true
  },

  async onShow() {
    if (admin.authEnabled()) {
      try {
        const res = await admin.checkAdmin()
        if (!res.isAdmin) {
          wx.showToast({ title: '无管理员权限', icon: 'none' })
          setTimeout(() => wx.navigateBack({ delta: 1 }), 600)
          return
        }
      } catch (e) {
        wx.showToast({ title: '身份校验失败', icon: 'none' })
        setTimeout(() => wx.navigateBack({ delta: 1 }), 600)
        return
      }
    }
    this.refresh()
  },

  async refresh() {
    try {
      const data = await api.getAll()
      this.setData({
        watermarkEnabled: !!(data.settings && data.settings.watermarkEnabled),
        shareEnabled:
          !data.settings || data.settings.shareEnabled == null
            ? true
            : !!data.settings.shareEnabled
      })
    } catch (e) {
      /* ignore */
    }
  },

  goEditSeries() {
    wx.navigateTo({ url: '/pages/admin/edit-series' })
  },

  goEditHome() {
    wx.navigateTo({ url: '/pages/admin/edit-home' })
  },

  goEditFeeds() {
    wx.navigateTo({ url: '/pages/admin/edit-feeds' })
  },

  goEditStore() {
    wx.navigateTo({ url: '/pages/admin/edit-store' })
  },

  onToggleWatermark(e) {
    const enabled = switchOn(e)
    const prev = this.data.watermarkEnabled
    this.setData({ watermarkEnabled: enabled })
    if (!cosUtil.hasCosCredentials()) {
      this.setData({ watermarkEnabled: prev })
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中', mask: true })
    api
      .getAll()
      .then((all) => {
        all.settings = { ...(all.settings || {}), watermarkEnabled: enabled }
        return api.saveAll(all)
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: enabled ? '已开启水印' : '已关闭水印', icon: 'success' })
      })
      .catch((err) => {
        this.setData({ watermarkEnabled: prev })
        wx.hideLoading()
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
      })
  },

  onToggleShare(e) {
    const enabled = switchOn(e)
    const prev = this.data.shareEnabled
    this.setData({ shareEnabled: enabled })
    if (!cosUtil.hasCosCredentials()) {
      this.setData({ shareEnabled: prev })
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中', mask: true })
    api
      .getAll()
      .then((all) => {
        all.settings = { ...(all.settings || {}), shareEnabled: enabled }
        return api.saveAll(all)
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: enabled ? '已开启分享' : '已关闭分享', icon: 'success' })
      })
      .catch((err) => {
        this.setData({ shareEnabled: prev })
        wx.hideLoading()
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
      })
  }
})
