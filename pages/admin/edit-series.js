const api = require('../../utils/api')
const cosUtil = require('../../utils/cos')

const PREF_KEY = 'series_delete_styles'

function switchOn(e) {
  const v = e && e.detail ? e.detail.value : false
  return v === true || v === 'true' || v === 1 || v === '1'
}

function readDeleteStylesPref() {
  try {
    return !!wx.getStorageSync(PREF_KEY)
  } catch (e) {
    return false
  }
}

function writeDeleteStylesPref(v) {
  try {
    wx.setStorageSync(PREF_KEY, !!v)
  } catch (e) {
    /* ignore */
  }
}

Page({
  data: {
    mode: 'list',
    series: [],
    deleteStylesWithSeries: false,
    form: { id: '', name: '', cover: '', sort: 0, hot: true, hidden: false }
  },

  onShow() {
    this.setData({ deleteStylesWithSeries: readDeleteStylesPref() })
    if (this.data.mode === 'list') this.loadList()
  },

  loadList() {
    api
      .getAll()
      .then((data) => {
        this.setData({ series: data.series || [] })
      })
      .catch((e) => {
        wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
      })
  },

  onToggleDeleteStyles(e) {
    const on = switchOn(e)
    writeDeleteStylesPref(on)
    this.setData({ deleteStylesWithSeries: on })
  },

  onCreate() {
    this.setData({
      mode: 'edit',
      form: { id: '', name: '', cover: '', sort: 0, hot: true, hidden: false }
    })
  },

  onEdit(e) {
    const item = this.data.series.find((s) => s.id === e.currentTarget.dataset.id)
    if (!item) return
    this.setData({
      mode: 'edit',
      form: {
        id: item.id,
        name: item.name,
        cover: item.cover,
        sort: item.sort || 0,
        hot: !!item.hot,
        hidden: !!item.hidden
      }
    })
  },

  onBack() {
    this.setData({ mode: 'list' })
    this.loadList()
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onHotChange(e) {
    this.setData({ 'form.hot': switchOn(e) })
  },

  onHiddenChange(e) {
    this.setData({ 'form.hidden': switchOn(e) })
  },

  onUploadCover() {
    cosUtil
      .chooseAndUpload(1, 'series/cover')
      .then((urls) => {
        this.setData({ 'form.cover': urls[0] })
      })
      .catch((e) => {
        if (e && e.errMsg && e.errMsg.includes('cancel')) return
        wx.showToast({ title: e.message || '上传失败', icon: 'none' })
      })
  },

  onSave() {
    const { form } = this.data
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写名称', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中', mask: true })
    api
      .getAll()
      .then((all) => {
        const item = {
          id: form.id || api.genId('series'),
          name: form.name.trim(),
          cover: form.cover,
          sort: Number(form.sort) || 0,
          hot: !!form.hot,
          hidden: !!form.hidden
        }
        const idx = all.series.findIndex((s) => s.id === item.id)
        if (idx >= 0) all.series[idx] = item
        else all.series.push(item)
        return api.saveAll(all)
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
        this.onBack()
      })
      .catch((e) => {
        wx.hideLoading()
        wx.showToast({ title: e.message || '失败', icon: 'none' })
      })
  },

  onDelete(e) {
    const id = (e.currentTarget.dataset && e.currentTarget.dataset.id) || this.data.form.id
    if (!id) return
    const item = this.data.series.find((s) => s.id === id) || this.data.form
    const name = (item && item.name) || '该系列'
    const deleteStyles = !!this.data.deleteStylesWithSeries
    api
      .getAll()
      .then((all) => {
        const styleCount = (all.styles || []).filter((s) => s.seriesId === id).length
        let content = `将删除「${name}」，不可恢复。`
        if (styleCount) {
          content = deleteStyles
            ? `将删除「${name}」及其下 ${styleCount} 条客片，不可恢复。确定？`
            : `将删除「${name}」。其下 ${styleCount} 条客片会变为「未归类」，可在客片管理中重新指定系列。确定？`
        }
        return new Promise((resolve) => {
          wx.showModal({
            title: '删除系列',
            content,
            confirmColor: '#e03131',
            success: (r) => resolve(r.confirm ? all : null)
          })
        })
      })
      .then((all) => {
        if (!all) return null
        if (!cosUtil.hasCosCredentials()) {
          wx.showToast({ title: '请先配置 COS', icon: 'none' })
          return null
        }
        wx.showLoading({ title: '删除中', mask: true })
        all.series = (all.series || []).filter((s) => s.id !== id)
        if (deleteStyles) {
          all.styles = (all.styles || []).filter((s) => s.seriesId !== id)
        } else {
          ;(all.styles || []).forEach((s) => {
            if (s.seriesId === id) s.seriesId = ''
          })
        }
        return api.saveAll(all)
      })
      .then((saved) => {
        if (!saved) return
        wx.hideLoading()
        wx.showToast({ title: '已删除', icon: 'success' })
        this.setData({ mode: 'list' })
        this.loadList()
      })
      .catch((err) => {
        wx.hideLoading()
        wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
      })
  }
})
