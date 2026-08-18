const api = require('../../utils/api')
const cosUtil = require('../../utils/cos')

function emptyForm() {
  return { id: '', text: '', images: [], sort: 1 }
}

Page({
  data: {
    mode: 'list',
    feeds: [],
    form: emptyForm()
  },

  onShow() {
    if (this.data.mode === 'list') this.loadList()
  },

  async loadList() {
    wx.showLoading({ title: '加载中' })
    try {
      const all = await api.getAll()
      const feeds = (all.home && all.home.feeds) || []
      this.setData({ feeds })
      wx.hideLoading()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },

  onCreate() {
    const sort = (this.data.feeds.length || 0) + 1
    this.setData({ mode: 'edit', form: { ...emptyForm(), id: api.genId('feed'), sort } })
  },

  onEdit(e) {
    const feed = this.data.feeds.find((f) => f.id === e.currentTarget.dataset.id)
    if (!feed) return
    this.setData({
      mode: 'edit',
      form: {
        id: feed.id,
        text: feed.text || '',
        images: (feed.images || []).slice(),
        sort: feed.sort != null ? feed.sort : 1
      }
    })
  },

  onCancel() {
    this.setData({ mode: 'list', form: emptyForm() })
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onUploadImages() {
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    const left = 9 - (this.data.form.images || []).length
    if (left <= 0) return
    cosUtil
      .chooseAndUpload(left, 'home/feeds')
      .then((urls) => {
        this.setData({ 'form.images': this.data.form.images.concat(urls).slice(0, 9) })
      })
      .catch((err) => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return
        wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
      })
  },

  onRemoveImage(e) {
    const images = this.data.form.images.slice()
    images.splice(e.currentTarget.dataset.index, 1)
    this.setData({ 'form.images': images })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除动态',
      content: '确定删除这条动态？',
      success: (r) => {
        if (!r.confirm) return
        this._persist((feeds) => feeds.filter((f) => f.id !== id), '已删除')
      }
    })
  },

  onSave() {
    const form = this.data.form
    const item = {
      id: form.id || api.genId('feed'),
      text: form.text || '',
      images: (form.images || []).slice(0, 9),
      sort: Number(form.sort) || 1
    }
    this._persist((feeds) => {
      const idx = feeds.findIndex((f) => f.id === item.id)
      if (idx >= 0) {
        const next = feeds.slice()
        next[idx] = item
        return next
      }
      return feeds.concat([item])
    }, '已保存').then((ok) => {
      if (ok) this.setData({ mode: 'list', form: emptyForm() })
    })
  },

  _persist(mutator, successTitle) {
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return Promise.resolve(false)
    }
    wx.showLoading({ title: '保存中', mask: true })
    return api
      .getAll()
      .then((all) => {
        all.home = all.home || {}
        const feeds = Array.isArray(all.home.feeds) ? all.home.feeds.slice() : []
        all.home.feeds = mutator(feeds)
        if (!all.home.covers) all.home.covers = []
        if (!all.home.studio) all.home.studio = {}
        return api.saveAll(all)
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: successTitle || '已保存', icon: 'success' })
        this.loadList()
        return true
      })
      .catch((e) => {
        wx.hideLoading()
        wx.showToast({ title: (e && e.message) || '失败', icon: 'none' })
        return false
      })
  }
})
