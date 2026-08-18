const api = require('../../utils/api')
const poster = require('../../utils/poster')
const userProfile = require('../../utils/userProfile')

function errText(e) {
  if (!e) return '生成失败'
  if (typeof e === 'string') return e
  return e.message || e.errMsg || '生成失败'
}

Page({
  data: {
    feedId: '',
    photos: [],
    selectedId: '',
    studio: { name: '椿屿影像', wxacode: '' },
    previewVisible: false,
    previewPath: '',
    generating: false,
    nickSheetVisible: false,
    nickDraft: '',
    pendingPhoto: ''
  },

  onLoad(query) {
    const feedId = (query && query.id) || ''
    this.setData({ feedId })
    this.load(feedId)
  },

  async load(feedId) {
    wx.showLoading({ title: '加载中' })
    try {
      const home = await api.getHome()
      const studio = home.studio || {}
      const feeds = home.feeds || []
      const feed = feeds.find((f) => f.id === feedId) || feeds[0]
      const images = (feed && Array.isArray(feed.images) ? feed.images : []).filter(Boolean)
      const photos = images.map((url, i) => ({ id: `feed_${i}`, url }))
      this.setData({
        feedId: (feed && feed.id) || feedId,
        photos,
        selectedId: photos[0] ? photos[0].id : '',
        studio: {
          name: studio.name || '椿屿影像',
          wxacode: studio.wxacode || ''
        }
      })
      wx.hideLoading()
      if (!photos.length) {
        wx.showToast({ title: '该动态暂无图片', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: errText(e) || '加载失败', icon: 'none' })
    }
  },

  onSelect(e) {
    const id = e.currentTarget.dataset.id
    if (id) this.setData({ selectedId: id })
  },

  onGenerate() {
    if (this.data.generating) return
    const selected = (this.data.photos || []).find((p) => p.id === this.data.selectedId)
    if (!selected) {
      wx.showToast({ title: '请先选择照片', icon: 'none' })
      return
    }
    // getUserProfile 已收回，改用官方 nickname 输入能力
    this.setData({
      nickSheetVisible: true,
      nickDraft: '',
      pendingPhoto: selected.url
    })
  },

  onNickSkip() {
    this.setData({ nickSheetVisible: false })
    this._compose(this.data.pendingPhoto, userProfile.DEFAULT_NICK)
  },

  onNickSubmit(e) {
    const nick = userProfile.resolveNickFromForm((e.detail && e.detail.value) || {})
    this.setData({ nickSheetVisible: false, nickDraft: nick === userProfile.DEFAULT_NICK ? '' : nick })
    this._compose(this.data.pendingPhoto, nick)
  },

  _compose(photoPath, nickName) {
    if (this.data.generating) return
    if (!photoPath) {
      wx.showToast({ title: '请先选择照片', icon: 'none' })
      return
    }
    const studio = this.data.studio || {}
    this.setData({ generating: true })
    wx.showLoading({ title: '名片生成中', mask: true })
    poster
      .composeFeedCard({
        page: this,
        photoPath,
        qrPath: studio.wxacode || '',
        studioName: studio.name,
        nickName: nickName || '微信用户'
      })
      .then((path) => {
        wx.hideLoading()
        this.setData({
          generating: false,
          previewVisible: true,
          previewPath: path
        })
      })
      .catch((e) => {
        wx.hideLoading()
        this.setData({ generating: false })
        wx.showToast({ title: String(errText(e)).slice(0, 40), icon: 'none' })
      })
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
      wx.showModal({
        title: '已保存到相册',
        content: '请打开微信朋友圈，从相册选择刚保存的名片图片发布。',
        showCancel: false,
        confirmText: '知道了'
      })
      this.setData({ previewVisible: false })
    } catch (e) {
      wx.hideLoading()
      const msg = errText(e)
      if (String(msg).indexOf('未授权') >= 0) return
      wx.showToast({ title: String(msg).slice(0, 40), icon: 'none' })
    }
  },

  noop() {}
})
