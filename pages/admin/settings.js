const cosUtil = require('../../utils/cos')

function maskId(id) {
  const s = String(id || '')
  if (s.length <= 8) return s ? '已配置' : '未配置'
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

Page({
  data: {
    configured: false,
    name: '',
    Bucket: '',
    Region: '',
    baseUrl: '',
    secretHint: '未配置',
    guestBaseUrl: '',
    guestReady: true,
    testing: false,
    probeDone: false,
    probeOk: false,
    probeSteps: []
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const c = cosUtil.getAdminConf()
    const configured = cosUtil.hasCosCredentials() && !!c.baseUrl
    this.setData({
      configured,
      name: c.name || '',
      Bucket: c.Bucket || '',
      Region: c.Region || '',
      baseUrl: c.baseUrl || '',
      secretHint: c.SecretId && c.SecretKey ? maskId(c.SecretId) : '未配置',
      guestBaseUrl: cosUtil.getGuestBaseUrl(),
      guestReady: cosUtil.isGuestBaseUrlReady()
    })
  },

  onTest() {
    if (this.data.testing) return
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先以管理员登录同步 COS', icon: 'none' })
      return
    }
    this.setData({ testing: true, probeDone: false, probeOk: false, probeSteps: [] })
    wx.showLoading({ title: '检测中', mask: true })
    const c = cosUtil.getAdminConf()
    cosUtil
      .testConnection({
        SecretId: c.SecretId,
        SecretKey: c.SecretKey,
        Bucket: c.Bucket,
        Region: c.Region,
        baseUrl: c.baseUrl
      })
      .then((result) => {
        this.setData({
          testing: false,
          probeDone: true,
          probeOk: result.ok,
          probeSteps: result.steps || []
        })
        wx.hideLoading()
        wx.showToast({
          title: result.ok ? '连通正常' : '检测未通过',
          icon: result.ok ? 'success' : 'none'
        })
      })
      .catch((e) => {
        this.setData({
          testing: false,
          probeDone: true,
          probeOk: false,
          probeSteps: [
            { id: 'fatal', name: '检测异常', ok: false, message: (e && e.message) || '未知错误' }
          ]
        })
        wx.hideLoading()
        wx.showToast({ title: '检测失败', icon: 'none' })
      })
  },

  onClearLocal() {
    wx.showModal({
      title: '清除本机 COS',
      content: '仅清除本机缓存的密钥。下次管理员登录会再次从 SCF 同步。',
      confirmColor: '#e03131',
      success: (r) => {
        if (!r.confirm) return
        cosUtil.clearAdminConf()
        this.refresh()
        this.setData({ probeDone: false, probeSteps: [] })
        wx.showToast({ title: '已清除', icon: 'none' })
      }
    })
  }
})
