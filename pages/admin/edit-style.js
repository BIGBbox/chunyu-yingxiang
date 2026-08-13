const api = require('../../utils/api')
const cosUtil = require('../../utils/cos')

Page({
  data: {
    mode: 'list',
    series: [],
    styles: [],
    filtered: [],
    filterLabels: ['全部系列'],
    seriesLabels: [],
    formSeriesIndex: 0,
    seriesNames: {},
    form: emptyForm()
  },

  onShow() {
    if (this.data.mode === 'list') this.loadList()
  },

  async loadList() {
    wx.showLoading({ title: '加载中' })
    try {
      const data = await api.getAll()
      const series = data.series || []
      const styles = data.styles || []
      const seriesNames = { '': '未归类' }
      series.forEach((s) => {
        seriesNames[s.id] = s.name
      })
      this.setData({
        series,
        styles,
        filtered: styles,
        seriesNames,
        // 筛选：全部 / 未归类 / 各系列
        filterLabels: ['全部系列', '未归类'].concat(series.map((s) => s.name)),
        // 编辑归属：未归类 + 各系列
        seriesLabels: ['未归类'].concat(series.map((s) => s.name))
      })
      wx.hideLoading()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onFilterSeries(e) {
    const idx = Number(e.detail.value)
    let filtered = this.data.styles
    if (idx === 1) {
      filtered = this.data.styles.filter((s) => !s.seriesId)
    } else if (idx > 1) {
      const seriesId = this.data.series[idx - 2].id
      filtered = this.data.styles.filter((s) => s.seriesId === seriesId)
    }
    this.setData({ filtered })
  },

  onCreate() {
    if (!this.data.series.length) {
      wx.showToast({ title: '请先创建系列', icon: 'none' })
      return
    }
    this.setData({
      mode: 'edit',
      formSeriesIndex: 1,
      form: emptyForm(this.data.series[0].id)
    })
  },

  onEdit(e) {
    const style = this.data.styles.find((s) => s.id === e.currentTarget.dataset.id)
    if (!style) return
    const pkg = style.package || {}
    // seriesLabels[0]=未归类，其后对应 series
    let formSeriesIndex = 0
    if (style.seriesId) {
      const si = this.data.series.findIndex((s) => s.id === style.seriesId)
      formSeriesIndex = si >= 0 ? si + 1 : 0
    }
    this.setData({
      mode: 'edit',
      formSeriesIndex,
      form: {
        id: style.id,
        seriesId: style.seriesId || '',
        name: style.name || '',
        cover: style.cover || '',
        images: style.images || [],
        gallery: style.gallery || [],
        avatar: style.avatar || '',
        sort: style.sort || 0,
        viewCount: style.viewCount || 0,
        package: {
          title: pkg.title || style.name || '',
          scene: pkg.scene || '',
          service: pkg.service || '',
          shooting: pkg.shooting || '',
          clothing: pkg.clothing || '',
          remark: pkg.remark || ''
        }
      }
    })
  },

  onBackList() {
    this.setData({ mode: 'list' })
    this.loadList()
  },

  onSeriesPick(e) {
    const idx = Number(e.detail.value)
    const seriesId = idx === 0 ? '' : this.data.series[idx - 1].id
    this.setData({
      formSeriesIndex: idx,
      'form.seriesId': seriesId
    })
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onPkgInput(e) {
    this.setData({ [`form.package.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  async onUploadImages() {
    try {
      const urls = await cosUtil.chooseAndUpload(9, 'styles/images')
      const images = this.data.form.images.concat(urls)
      this.setData({
        'form.images': images,
        'form.cover': this.data.form.cover || images[0]
      })
    } catch (e) {
      if (e && e.errMsg && e.errMsg.includes('cancel')) return
      wx.showToast({ title: e.message || '上传失败', icon: 'none' })
    }
  },

  async onUploadGallery() {
    try {
      const urls = await cosUtil.chooseAndUpload(9, 'styles/gallery')
      this.setData({ 'form.gallery': this.data.form.gallery.concat(urls) })
    } catch (e) {
      if (e && e.errMsg && e.errMsg.includes('cancel')) return
      wx.showToast({ title: e.message || '上传失败', icon: 'none' })
    }
  },

  async onUploadAvatar() {
    try {
      const urls = await cosUtil.chooseAndUpload(1, 'styles/avatar')
      this.setData({ 'form.avatar': urls[0] })
    } catch (e) {
      if (e && e.errMsg && e.errMsg.includes('cancel')) return
      wx.showToast({ title: e.message || '上传失败', icon: 'none' })
    }
  },

  onRemoveImage(e) {
    const images = this.data.form.images.slice()
    images.splice(e.currentTarget.dataset.index, 1)
    this.setData({ 'form.images': images, 'form.cover': images[0] || '' })
  },

  onRemoveGallery(e) {
    const gallery = this.data.form.gallery.slice()
    gallery.splice(e.currentTarget.dataset.index, 1)
    this.setData({ 'form.gallery': gallery })
  },

  async onSave() {
    const { form } = this.data
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写名称', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中', mask: true })
    try {
      const all = await api.getAll()
      const pkg = { ...form.package }
      if (!pkg.title) pkg.title = form.name
      const item = {
        id: form.id || api.genId('style'),
        seriesId: form.seriesId,
        name: form.name.trim(),
        cover: form.cover || (form.images[0] || ''),
        images: form.images,
        gallery: form.gallery.length ? form.gallery : form.images,
        avatar: form.avatar,
        sort: Number(form.sort) || 0,
        viewCount: form.viewCount || 0,
        updatedAt: api.formatNow(),
        package: pkg
      }
      const idx = all.styles.findIndex((s) => s.id === item.id)
      if (idx >= 0) all.styles[idx] = item
      else all.styles.push(item)
      await api.saveAll(all)
      wx.hideLoading()
      wx.showToast({ title: '已保存到 COS', icon: 'success' })
      this.onBackList()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    }
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id
    const ok = await new Promise((r) => {
      wx.showModal({
        title: '删除客片',
        content: '确定删除？',
        success: (res) => r(res.confirm)
      })
    })
    if (!ok) return
    try {
      const all = await api.getAll()
      all.styles = all.styles.filter((s) => s.id !== id)
      await api.saveAll(all)
      wx.showToast({ title: '已删除', icon: 'success' })
      this.loadList()
    } catch (err) {
      wx.showToast({ title: err.message || '失败', icon: 'none' })
    }
  }
})

function emptyForm(seriesId) {
  return {
    id: '',
    seriesId: seriesId || '',
    name: '',
    cover: '',
    images: [],
    gallery: [],
    avatar: '',
    sort: 0,
    viewCount: 0,
    package: {
      title: '',
      scene: '单独妆造399，周边拍摄899，虎丘拍摄1099。',
      service: '资深摄影师、化妆师全程一对一服务',
      shooting: '底片：30张（多拍免费送）\n精修：9张（精修均为人工精修）',
      clothing: '提供服装：1套\n定制妆造：1次',
      remark: ''
    }
  }
}
