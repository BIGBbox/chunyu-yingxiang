const api = require('../../utils/api')
const cosUtil = require('../../utils/cos')

const EMPTY = {
  xhs: { name: '小红书', account: '', id: '', qrcode: '', avatar: '', banner: '', enabled: false },
  douyin: { name: '抖音', account: '', id: '', qrcode: '', avatar: '', banner: '', enabled: false }
}

function switchOn(e) {
  const v = e && e.detail ? e.detail.value : false
  return v === true || v === 'true' || v === 1 || v === '1'
}

Page({
  data: {
    tab: 'xhs',
    xhsEnabled: false,
    douyinEnabled: false,
    form: { ...EMPTY.xhs }
  },

  onLoad() {
    this.load()
  },

  load() {
    api
      .getAll()
      .then((all) => {
        this._cache = {
          xhs: { ...EMPTY.xhs, ...(all.social && all.social.xhs) },
          douyin: { ...EMPTY.douyin, ...(all.social && all.social.douyin) }
        }
        const xhsEnabled = api.flagOn(this._cache.xhs.enabled)
        const douyinEnabled = api.flagOn(this._cache.douyin.enabled)
        this._cache.xhs.enabled = xhsEnabled
        this._cache.douyin.enabled = douyinEnabled
        this.setData({
          xhsEnabled,
          douyinEnabled,
          form: this._cache[this.data.tab]
        })
      })
      .catch((e) => {
        wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
      })
  },

  onTab(e) {
    this._cache[this.data.tab] = this.data.form
    const tab = e.currentTarget.dataset.tab
    this.setData({ tab, form: this._cache[tab] })
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  persistSocial(patch) {
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return Promise.reject(new Error('请先配置 COS'))
    }
    const run = () => {
      const tab = this.data.tab
      // 文案以当前表单为准；展示开关以 _cache 为准（避免 setData 未回写时把开关覆盖掉）
      this._cache[tab] = {
        ...this.data.form,
        enabled: !!(this._cache[tab] && this._cache[tab].enabled)
      }
      if (patch) {
        Object.keys(patch).forEach((key) => {
          this._cache[key] = { ...this._cache[key], ...patch[key] }
        })
      }
      const xhs = { ...this._cache.xhs, enabled: !!this._cache.xhs.enabled }
      const douyin = { ...this._cache.douyin, enabled: !!this._cache.douyin.enabled }
      return api.getAll().then((all) => {
        all.social = {
          ...(all.social || {}),
          xhs,
          douyin,
          enabled: !!xhs.enabled || !!douyin.enabled
        }
        return api.saveAll(all)
      })
    }
    this._persistChain = (this._persistChain || Promise.resolve()).then(run, run)
    return this._persistChain
  },

  onTogglePlatform(e) {
    const key = e.currentTarget.dataset.key
    const enabled = switchOn(e)
    const flagField = key === 'xhs' ? 'xhsEnabled' : 'douyinEnabled'
    const prev = this.data[flagField]
    if (!this._cache) this._cache = { xhs: { ...EMPTY.xhs }, douyin: { ...EMPTY.douyin } }
    this._cache[this.data.tab] = this.data.form
    this._cache[key] = { ...this._cache[key], enabled }
    const nextForm = this.data.tab === key ? { ...this.data.form, enabled } : this.data.form
    this.setData({ [flagField]: enabled, form: nextForm })
    this.persistSocial()
      .then(() => {
        wx.showToast({
          title: enabled ? (key === 'xhs' ? '已开启小红书' : '已开启抖音') : (key === 'xhs' ? '已关闭小红书' : '已关闭抖音'),
          icon: 'success'
        })
      })
      .catch((err) => {
        this._cache[key] = { ...this._cache[key], enabled: prev }
        const revertForm = this.data.tab === key ? { ...this.data.form, enabled: prev } : this.data.form
        this.setData({ [flagField]: prev, form: revertForm })
        if (err && err.message === '请先配置 COS') return
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
      })
  },

  uploadField(field, dir) {
    cosUtil
      .chooseAndUpload(1, dir)
      .then((urls) => {
        this.setData({ [`form.${field}`]: urls[0] })
      })
      .catch((e) => {
        if (e && e.errMsg && e.errMsg.includes('cancel')) return
        wx.showToast({ title: e.message || '上传失败', icon: 'none' })
      })
  },

  onUploadQr() {
    this.uploadField('qrcode', 'social/qrcode')
  },
  onUploadAvatar() {
    this.uploadField('avatar', 'social/avatar')
  },
  onUploadBanner() {
    this.uploadField('banner', 'social/banner')
  },

  onSave() {
    wx.showLoading({ title: '保存中', mask: true })
    this.persistSocial()
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
      })
      .catch((e) => {
        wx.hideLoading()
        if (e && e.message === '请先配置 COS') return
        wx.showToast({ title: e.message || '失败', icon: 'none' })
      })
  }
})
