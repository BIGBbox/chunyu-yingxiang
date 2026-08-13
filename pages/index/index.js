const api = require('../../utils/api')
const admin = require('../../utils/admin')
const cosUtil = require('../../utils/cos')
const { adminTapCount } = require('../../config')

Page({
  data: {
    keyword: '',
    seriesList: [],
    social: { xhs: null, douyin: null },
    showSocial: false,
    showXhs: false,
    showDouyin: false,
    showStore: false,
    styleCount: 0
  },

  _titleTap: 0,
  _titleTapTimer: null,

  onLoad() {
    this.loadHome()
  },

  onPullDownRefresh() {
    api.loadContent(true).then(() => this.loadHome()).finally(() => wx.stopPullDownRefresh())
  },

  /** app.onShow 静默刷新到新数据后回调 */
  onContentUpdated() {
    this.loadHome()
  },

  async loadHome() {
    try {
      const data = await api.getHome()
      this.setData({
        seriesList: data.seriesList || [],
        social: data.social || {},
        showSocial: !!data.showSocial,
        showXhs: !!data.showXhs,
        showDouyin: !!data.showDouyin,
        showStore: !!data.showStore,
        styleCount: data.styleCount || 0
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  async onSearch() {
    const { keyword } = this.data
    if (!keyword.trim()) {
      wx.showToast({ title: '请输入关键词', icon: 'none' })
      return
    }
    const { results } = await api.search(keyword)
    if (!results.length) {
      wx.showToast({ title: '未找到相关客片', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/series/series?id=${results[0].seriesId}&keyword=${encodeURIComponent(keyword)}`
    })
  },

  onImageSearch() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: () => wx.showToast({ title: '图片搜索功能开发中', icon: 'none' })
    })
  },

  onSeriesTap(e) {
    wx.navigateTo({ url: `/pages/series/series?id=${e.currentTarget.dataset.id}` })
  },

  onStoreTap() {
    wx.navigateTo({ url: '/pages/store/store' })
  },

  onPreviewQr(e) {
    const { url } = e.currentTarget.dataset
    if (url) wx.previewImage({ urls: [url], current: url })
  },

  onSaveQr(e) {
    this.onPreviewQr(e)
  },

  onTitleTap() {
    this._titleTap += 1
    clearTimeout(this._titleTapTimer)
    this._titleTapTimer = setTimeout(() => {
      this._titleTap = 0
    }, 1500)
    if (this._titleTap >= adminTapCount) {
      this._titleTap = 0
      this.enterAdmin()
    }
  },

  async enterAdmin() {
    if (this._entering) return
    // 未启用云端鉴权：开发期直接进入
    if (!admin.authEnabled()) {
      wx.navigateTo({ url: '/pages/admin/index' })
      return
    }
    this._entering = true
    try {
      const res = await admin.checkAdmin(true)
      if (res.isAdmin) {
        if (res.cosImported) {
          wx.showToast({ title: '已同步 COS 配置', icon: 'success' })
        } else if (!cosUtil.hasCosCredentials()) {
          wx.showToast({ title: '服务端未下发完整 COS', icon: 'none' })
        }
        wx.navigateTo({ url: '/pages/admin/index' })
        return
      }
      // 非管理员：自动复制 openid，方便发给主管理员加白名单
      if (res.openid) {
        try {
          await new Promise((resolve, reject) => {
            wx.setClipboardData({
              data: res.openid,
              success: resolve,
              fail: reject
            })
          })
        } catch (e) {
          /* 复制失败仍弹窗展示 */
        }
      }
      // wx.showModal({
      //   title: '无管理员权限',
      //   content: res.openid
      //     ? `你的 openid 已复制到剪贴板：\n${res.openid}\n\n发给主管理员，让他填进 SCF 环境变量 ADMIN_OPENIDS（注意 O 和 0 不要抄错）。`
      //     : res.error || '当前微信不是管理员。',
      //   showCancel: false,
      //   confirmText: '知道了'
      // })
    } catch (e) {
      // wx.showModal({
      //   title: '验证失败',
      //   content: (e && e.message) || '请检查网络与 request 合法域名配置',
      //   showCancel: false
      // })
    } finally {
      this._entering = false
    }
  }
})
