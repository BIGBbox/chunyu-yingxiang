const api = require('../../utils/api')
const poster = require('../../utils/poster')

Page({
  data: {
    mode: 'poster', // poster=自定义海报（可相册）；moments=朋友圈（仅封面）
    allowAlbum: true,
    photos: [],
    selectedId: '',
    studio: { name: '椿屿影像', tags: [], wxacode: '' },
    previewVisible: false,
    previewPath: '',
    generating: false
  },

  _albumSeq: 0,

  onLoad(query) {
    const mode = query && query.mode === 'moments' ? 'moments' : 'poster'
    this._from = (query && query.from) || ''
    this._fromId = (query && query.id) || ''
    this.setData({
      mode,
      allowAlbum: mode === 'poster' && !this._from
    })
    wx.setNavigationBarTitle({
      title: mode === 'moments' ? '分享到朋友圈' : '自定义海报'
    })
    this.load()
  },

  async load() {
    wx.showLoading({ title: '加载中' })
    try {
      const home = await api.getHome()
      const studio = home.studio || {}
      let photos = []
      if (this._from === 'series' && this._fromId) {
        const data = await api.getStylesBySeries(this._fromId)
        const cover =
          (data.series && data.series.cover) ||
          (data.styles && data.styles[0] && data.styles[0].cover) ||
          ''
        if (cover) photos = [{ id: 'work_cover', url: cover, from: 'work' }]
      } else if (this._from === 'style' && this._fromId) {
        const detail = await api.getStyleDetail(this._fromId)
        const cover =
          (detail && detail.cover) ||
          (detail && detail.images && detail.images[0]) ||
          ''
        if (cover) photos = [{ id: 'work_cover', url: cover, from: 'work' }]
      } else {
        photos = poster.coversToPhotos(home.covers)
      }
      const selectedId = photos[0] ? photos[0].id : ''
      this.setData({
        photos,
        selectedId,
        studio: {
          name: studio.name || '椿屿影像',
          tags: studio.tags || [],
          wxacode: studio.wxacode || ''
        }
      })
      wx.hideLoading()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },

  onSelect(e) {
    const id = e.currentTarget.dataset.id
    if (id) this.setData({ selectedId: id })
  },

  onPickAlbum() {
    if (!this.data.allowAlbum) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.tempFilePath) return
        this._albumSeq += 1
        const id = `album_${Date.now()}_${this._albumSeq}`
        const item = { id, url: f.tempFilePath, from: 'album' }
        const photos = this.data.photos.concat([item])
        this.setData({ photos, selectedId: id })
      }
    })
  },

  async onGenerate() {
    if (this.data.generating) return
    const { selectedId, photos, studio } = this.data
    const selected = (photos || []).find((p) => p.id === selectedId)
    if (!selected) {
      wx.showToast({ title: '请先选择照片', icon: 'none' })
      return
    }

    this.setData({ generating: true })
    wx.showLoading({ title: '名片生成中', mask: true })
    try {
      const path = await poster.composeCard({
        page: this,
        photoPath: selected.url,
        qrPath: studio.wxacode || '',
        studioName: studio.name,
        tags: studio.tags
      })
      wx.hideLoading()
      this.setData({
        generating: false,
        previewVisible: true,
        previewPath: path
      })
    } catch (e) {
      wx.hideLoading()
      this.setData({ generating: false })
      wx.showToast({
        title: (e && e.message) || e.errMsg || '生成失败',
        icon: 'none'
      })
    }
  },

  onDiscard() {
    this.setData({ previewVisible: false, previewPath: '' })
  },

  async onSaveAlbum() {
    const filePath = this.data.previewPath
    if (!filePath) return
    wx.showLoading({ title: '保存中', mask: true })
    try {
      await poster.saveToAlbum(filePath)
      wx.hideLoading()
      if (this.data.mode === 'moments') {
        wx.showModal({
          title: '已保存到相册',
          content: '请打开微信朋友圈，从相册选择刚保存的名片图片发布。',
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      }
      this.setData({ previewVisible: false })
    } catch (e) {
      wx.hideLoading()
      const msg = (e && e.message) || e.errMsg || '保存失败'
      if (msg.indexOf('未授权') >= 0) return
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  noop() {}
})
