const cosUtil = require('../../utils/cos')
const api = require('../../utils/api')
const admin = require('../../utils/admin')

Page({
  data: {
    configured: false,
    baseUrl: '',
    profileName: '',
    profileCount: 0,
    guestBaseUrl: '',
    guestReady: true,
    guestMismatch: false,
    envVersion: '',
    isRelease: false,
    updatedAt: '',
    seriesCount: 0,
    styleCount: 0,
    watermarkEnabled: false
  },

  async onShow() {
    // 防御：即便被直接打开，也要再校验一次管理员身份
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
    const active = cosUtil.getAdminConf()
    const store = cosUtil.listProfiles()
    const baseUrl = cosUtil.getBaseUrl()
    const guestBaseUrl = cosUtil.getGuestBaseUrl()
    const guestReady = cosUtil.isGuestBaseUrlReady()
    this.setData({
      configured: cosUtil.hasCosCredentials() && !!baseUrl,
      baseUrl,
      profileName: active.name || '',
      profileCount: store.list.length,
      guestBaseUrl,
      guestReady,
      guestMismatch: guestReady && !!baseUrl && guestBaseUrl !== baseUrl,
      envVersion: cosUtil.getEnvVersion(),
      isRelease: cosUtil.getEnvVersion() === 'release'
    })
    try {
      const data = await api.getAll()
      this.setData({
        seriesCount: (data.series || []).length,
        styleCount: (data.styles || []).length,
        updatedAt: data.updatedAt || '',
        watermarkEnabled: !!(data.settings && data.settings.watermarkEnabled)
      })
    } catch (e) {
      /* ignore */
    }
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/admin/settings' })
  },

  goEditStyle() {
    wx.navigateTo({ url: '/pages/admin/edit-style' })
  },

  goEditSeries() {
    wx.navigateTo({ url: '/pages/admin/edit-series' })
  },

  goEditStore() {
    wx.navigateTo({ url: '/pages/admin/edit-store' })
  },

  goEditSocial() {
    wx.navigateTo({ url: '/pages/admin/edit-social' })
  },

  onToggleWatermark(e) {
    const enabled = !!e.detail.value
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

  async onUploadSeed() {
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '上传初始数据',
        content: '将本地演示 content.json 上传到 COS，覆盖线上文件。图片仍是外链，请随后点「迁移演示图片」。确定？',
        success: (r) => resolve(r.confirm)
      })
    })
    if (!ok) return
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const local = JSON.parse(JSON.stringify(require('../../data/content.js')))
      const current = api.getCache()
      if (current) {
        if (current.store) local.store.enabled = !!current.store.enabled
        if (current.social) {
          local.social.enabled = !!current.social.enabled
          if (local.social.xhs && current.social.xhs) {
            local.social.xhs.enabled = !!current.social.xhs.enabled
          }
          if (local.social.douyin && current.social.douyin) {
            local.social.douyin.enabled = !!current.social.douyin.enabled
          }
        }
        if (current.settings) local.settings = current.settings
      }
      await api.saveAll(local)
      wx.hideLoading()
      wx.showToast({ title: '已上传到 COS', icon: 'success' })
      this.refresh()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '上传失败', icon: 'none' })
    }
  },

  async onMigrateImages() {
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '迁移演示图片',
        content:
          '将 content 中的外链图片（如 picsum）下载并上传到当前 COS，再回写 content.json。开发者工具需勾选「不校验合法域名」。确定？',
        success: (r) => resolve(r.confirm)
      })
    })
    if (!ok) return

    wx.showLoading({ title: '准备中', mask: true })
    try {
      let content
      try {
        content = await cosUtil.fetchRemoteContent()
      } catch (e) {
        content = require('../../data/content.js')
      }
      const result = await api.migrateExternalImages(content, (done, total) => {
        wx.showLoading({ title: `迁移 ${done}/${total}`, mask: true })
      })
      if (!result.migrated) {
        wx.hideLoading()
        wx.showToast({ title: '没有需要迁移的外链图', icon: 'none' })
        return
      }
      wx.showLoading({ title: '写回 JSON', mask: true })
      await api.saveAll(result.content)
      wx.hideLoading()
      wx.showToast({ title: `已迁移 ${result.migrated} 张`, icon: 'success' })
      this.refresh()
    } catch (e) {
      wx.hideLoading()
      wx.showModal({
        title: '迁移失败',
        content: (e && e.message) || e.errMsg || '请检查网络与 downloadFile 域名',
        showCancel: false
      })
    }
  },

  async onReload() {
    wx.showLoading({ title: '刷新中' })
    try {
      await api.loadContent(true)
      wx.hideLoading()
      wx.showToast({ title: '已刷新', icon: 'success' })
      this.refresh()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '失败', icon: 'none' })
    }
  }
})
