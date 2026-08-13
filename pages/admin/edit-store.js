const api = require('../../utils/api')
const cosUtil = require('../../utils/cos')

function switchOn(e) {
  const v = e && e.detail ? e.detail.value : false
  return v === true || v === 'true' || v === 1 || v === '1'
}

Page({
  data: {
    form: {
      enabled: false,
      city: '景德镇门店',
      title: '景德镇门店信息',
      address: '',
      guidance: [],
      environment: []
    }
  },

  onLoad() {
    this.load()
  },

  load() {
    api
      .getStore()
      .then((store) => {
        const enabled = api.flagOn(store && store.enabled)
        this._enabled = enabled
        this.setData({
          form: {
            enabled: false,
            city: '景德镇门店',
            title: '景德镇门店信息',
            address: '',
            guidance: [],
            environment: [],
            ...store,
            enabled
          }
        })
      })
      .catch((e) => {
        wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
      })
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onToggleEnabled(e) {
    const enabled = switchOn(e)
    const prev = this._enabled
    this._enabled = enabled
    this.setData({ 'form.enabled': enabled })
    if (!cosUtil.hasCosCredentials()) {
      this._enabled = prev
      this.setData({ 'form.enabled': prev })
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中', mask: true })
    api
      .getAll()
      .then((all) => {
        all.store = { ...(all.store || {}), ...this.data.form, enabled: !!enabled }
        return api.saveAll(all)
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: enabled ? '已开启门店展示' : '已关闭门店展示', icon: 'success' })
      })
      .catch((err) => {
        this._enabled = prev
        this.setData({ 'form.enabled': prev })
        wx.hideLoading()
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
      })
  },

  onUploadEnv() {
    cosUtil
      .chooseAndUpload(9, 'store/env')
      .then((urls) => {
        this.setData({ 'form.environment': this.data.form.environment.concat(urls) })
      })
      .catch((e) => {
        if (e && e.errMsg && e.errMsg.includes('cancel')) return
        wx.showToast({ title: e.message || '上传失败', icon: 'none' })
      })
  },

  onUploadGuide() {
    cosUtil
      .chooseAndUpload(9, 'store/guide')
      .then((urls) => {
        this.setData({ 'form.guidance': (this.data.form.guidance || []).concat(urls) })
      })
      .catch((e) => {
        if (e && e.errMsg && e.errMsg.includes('cancel')) return
        wx.showToast({ title: e.message || '上传失败', icon: 'none' })
      })
  },

  onRemoveEnv(e) {
    const environment = this.data.form.environment.slice()
    environment.splice(e.currentTarget.dataset.index, 1)
    this.setData({ 'form.environment': environment })
  },

  onRemoveGuide(e) {
    const guidance = this.data.form.guidance.slice()
    guidance.splice(e.currentTarget.dataset.index, 1)
    this.setData({ 'form.guidance': guidance })
  },

  onSave() {
    wx.showLoading({ title: '保存中', mask: true })
    const enabled = this._enabled != null ? !!this._enabled : api.flagOn(this.data.form.enabled)
    api
      .getAll()
      .then((all) => {
        all.store = { ...this.data.form, enabled }
        return api.saveAll(all)
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
      })
      .catch((e) => {
        wx.hideLoading()
        wx.showToast({ title: e.message || '失败', icon: 'none' })
      })
  }
})
