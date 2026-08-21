const api = require('../../utils/api')
const cosUtil = require('../../utils/cos')

function emptyForm(seriesId) {
  return {
    id: '',
    seriesId: seriesId || '',
    name: '',
    cover: '',
    images: [],
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

function moveItem(list, from, to) {
  const next = (list || []).slice()
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  const item = next.splice(from, 1)[0]
  next.splice(to, 0, item)
  return next
}

Page({
  data: {
    mode: 'list',
    statusBarHeight: 20,
    series: [],
    styles: [],
    filtered: [],
    filterLabels: ['全部系列'],
    seriesLabels: ['未归类'],
    formSeriesIndex: 0,
    seriesNames: { '': '未归类' },
    photoList: [],
    activePhotoIndex: -1,
    draggingPhotoIndex: -1,
    dragGhostUrl: '',
    dragGhostX: 0,
    dragGhostY: 0,
    form: emptyForm()
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sys.statusBarHeight || 20 })
  },

  onShow() {
    if (this.data.mode === 'list') this.loadList()
  },

  /** 自定义顶栏返回：编辑态回列表，列表态退出本页 */
  onNavBack() {
    if (this.data.mode === 'edit') {
      this.onBackList()
      return
    }
    wx.navigateBack({ delta: 1 })
  },

  /** Android 物理返回 / 侧滑：编辑态回列表 */
  onBackPress() {
    if (this.data.mode === 'edit') {
      this.onBackList()
      return true
    }
    return false
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
        filterLabels: ['全部系列', '未归类'].concat(series.map((s) => s.name)),
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
    const firstSeriesId = this.data.series[0] ? this.data.series[0].id : ''
    const form = emptyForm(firstSeriesId)
    this._clearDragState(true)
    this.setData({
      mode: 'edit',
      formSeriesIndex: firstSeriesId ? 1 : 0,
      form,
      photoList: []
    })
  },

  onEdit(e) {
    const style = this.data.styles.find((s) => s.id === e.currentTarget.dataset.id)
    if (!style) return
    const pkg = style.package || {}
    let formSeriesIndex = 0
    if (style.seriesId) {
      const si = this.data.series.findIndex((s) => s.id === style.seriesId)
      formSeriesIndex = si >= 0 ? si + 1 : 0
    }
    const images = (style.gallery && style.gallery.length ? style.gallery : style.images) || []
    this._clearDragState(true)
    this.setData({
      mode: 'edit',
      formSeriesIndex,
      form: {
        id: style.id,
        seriesId: style.seriesId || '',
        name: style.name || '',
        cover: style.cover || '',
        images,
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
      },
      photoList: images.slice()
    })
  },

  onBackList() {
    this._clearDragState(true)
    this.setData({ mode: 'list', photoList: [] })
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

  async onUploadImages() {
    try {
      const urls = await cosUtil.chooseAndUpload(9, 'styles/images')
      const images = (this.data.form.images || []).concat(urls)
      this.setData({
        'form.images': images,
        'form.cover': this.data.form.cover || images[0],
        photoList: images.slice(),
        activePhotoIndex: -1
      })
    } catch (e) {
      if (e && e.errMsg && e.errMsg.includes('cancel')) return
      wx.showToast({ title: e.message || '上传失败', icon: 'none' })
    }
  },

  onPhotoTap(e) {
    if (this.data.draggingPhotoIndex >= 0) return
    const idx = Number(e.currentTarget.dataset.index)
    this.setData({
      activePhotoIndex: this.data.activePhotoIndex === idx ? -1 : idx
    })
  },

  onPhotoLongPress(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const images = (this.data.form.images || []).slice()
    if (!Number.isInteger(idx) || idx < 0 || idx >= images.length) return
    try {
      wx.vibrateShort({ type: 'light' })
    } catch (err) {
      /* ignore */
    }
    this._dragOriginal = images
    this._dragFrom = idx
    this._previewTo = idx
    this._measurePhotoRects().then((rects) => {
      this._photoSlots = rects
      const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
      const rect = rects[idx]
      const x = touch ? touch.clientX : rect ? rect.left + rect.width / 2 : 0
      const y = touch ? touch.clientY : rect ? rect.top + rect.height / 2 : 0
      this.setData({
        activePhotoIndex: -1,
        photoList: images.slice(),
        draggingPhotoIndex: idx,
        dragGhostUrl: images[idx],
        dragGhostX: x,
        dragGhostY: y
      })
    })
  },

  onGridTouchMove(e) {
    if (this.data.draggingPhotoIndex < 0 || !this._dragOriginal) return
    const touch = e.touches && e.touches[0]
    if (!touch || !Array.isArray(this._photoSlots) || !this._photoSlots.length) return
    const target = this._findDropIndex(touch.clientX, touch.clientY)
    const patch = {
      dragGhostX: touch.clientX,
      dragGhostY: touch.clientY
    }
    // 命中固定用长按瞬间的格子，预览列表实时重排；松手前不写 form.images
    if (target !== this._previewTo) {
      this._previewTo = target
      const preview = moveItem(this._dragOriginal, this._dragFrom, target)
      patch.photoList = preview
      patch.draggingPhotoIndex = target
    }
    this.setData(patch)
  },

  onPhotoTouchEnd() {
    if (this.data.draggingPhotoIndex < 0) return
    const preview = (this.data.photoList || []).slice()
    // 松手才写入实际排序
    this.setData({
      'form.images': preview,
      photoList: preview
    })
    this._clearDragState()
  },

  _clearDragState(skipSet) {
    this._dragOriginal = null
    this._dragFrom = -1
    this._previewTo = -1
    this._photoSlots = null
    if (skipSet) return
    this.setData({
      activePhotoIndex: -1,
      draggingPhotoIndex: -1,
      dragGhostUrl: '',
      dragGhostX: 0,
      dragGhostY: 0
    })
  },

  _findDropIndex(x, y) {
    const rects = this._photoSlots || []
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      if (!r) continue
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i
    }
    let best = 0
    let min = Infinity
    rects.forEach((r, i) => {
      if (!r) return
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dist = Math.hypot(x - cx, y - cy)
      if (dist < min) {
        min = dist
        best = i
      }
    })
    return best
  },

  _measurePhotoRects() {
    return new Promise((resolve) => {
      const q = wx.createSelectorQuery()
      q.selectAll('.photo-card').boundingClientRect()
      q.exec((res) => resolve((res && res[0]) || []))
    })
  },

  onPhotoAction(e) {
    const { index, action } = e.currentTarget.dataset
    const idx = Number(index)
    const images = (this.data.form.images || []).slice()
    if (!Number.isInteger(idx) || idx < 0 || idx >= images.length) return
    if (action === 'remove') {
      const removed = images[idx]
      images.splice(idx, 1)
      this.setData({
        'form.images': images,
        photoList: images.slice(),
        'form.cover': this.data.form.cover === removed ? images[0] || '' : this.data.form.cover,
        activePhotoIndex: -1
      })
      return
    }
    if (action === 'cover') {
      this.setData({
        'form.cover': images[idx],
        activePhotoIndex: -1
      })
    }
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
        gallery: form.images.slice(),
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
    if (!id) return
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '删除作品',
        content: '确定删除？',
        success: (res) => resolve(res.confirm)
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
