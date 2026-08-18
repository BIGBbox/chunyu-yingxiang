const api = require('../../utils/api')
const share = require('../../utils/share')

const LIKES_KEY = 'style_likes_v1'

function readLikes() {
  try {
    const raw = wx.getStorageSync(LIKES_KEY)
    return raw && typeof raw === 'object' ? raw : {}
  } catch (e) {
    return {}
  }
}

function writeLikes(map) {
  try {
    wx.setStorageSync(LIKES_KEY, map)
  } catch (e) {
    /* ignore */
  }
}

function mergePhotos(detail) {
  const list = []
  const seen = {}
  const push = (url) => {
    if (!url || seen[url]) return
    seen[url] = true
    list.push(url)
  }
  ;(detail.images || []).forEach(push)
  ;(detail.gallery || []).forEach(push)
  if (!list.length && detail.cover) push(detail.cover)
  return list
}

Page({
  data: {
    detail: null,
    loading: true,
    styleId: '',
    photos: [],
    viewMode: 'list',
    studioName: '椿屿影像',
    studioAvatar: '',
    liked: false,
    statusBarHeight: 20,
    shareSheetVisible: false,
    scrubberTop: 120,
    scrubberHeight: 400,
    scrubThumbTop: 0,
    windowHeight: 700
  },

  onLoad(options) {
    share.syncShareMenu()
    const sys = wx.getSystemInfoSync()
    const statusBarHeight = sys.statusBarHeight || 20
    const windowHeight = sys.windowHeight || 700
    const scrubberTop = statusBarHeight + 160
    const scrubberHeight = Math.max(200, windowHeight - scrubberTop - 120)
    this.setData({
      styleId: options.id || '',
      statusBarHeight,
      windowHeight,
      scrubberTop,
      scrubberHeight
    })
    if (options.id) this.load(options.id)
  },

  onPageScroll(e) {
    this._updateScrubFromScroll(e.scrollTop || 0)
  },

  async load(id) {
    this.setData({ loading: true })
    try {
      const [detail, home] = await Promise.all([api.getStyleDetail(id), api.getHome()])
      const likes = readLikes()
      const studio = home.studio || {}
      this.setData({
        detail,
        photos: mergePhotos(detail),
        studioName: studio.name || '椿屿影像',
        studioAvatar: studio.avatar || '',
        liked: !!likes[id],
        loading: false
      })
      setTimeout(() => this._measureScrollRange(), 300)
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onContentUpdated() {
    if (this.data.styleId) this.load(this.data.styleId)
    share.syncShareMenu()
  },

  _measureScrollRange() {
    const q = wx.createSelectorQuery()
    q.select('.page').boundingClientRect()
    q.exec((res) => {
      const rect = res && res[0]
      if (!rect) return
      const maxScroll = Math.max(0, rect.height - this.data.windowHeight)
      this._maxScroll = maxScroll
      this._updateScrubFromScroll(0)
    })
  },

  _updateScrubFromScroll(scrollTop) {
    const max = this._maxScroll || 1
    const ratio = Math.min(1, Math.max(0, scrollTop / max))
    const track = this.data.scrubberHeight - 28
    this.setData({ scrubThumbTop: Math.round(ratio * track) })
  },

  onScrubStart(e) {
    this._scrubbing = true
    this._scrubTo(e.touches[0].clientY)
  },

  onScrubMove(e) {
    if (!this._scrubbing) return
    this._scrubTo(e.touches[0].clientY)
  },

  onScrubEnd() {
    this._scrubbing = false
  },

  _scrubTo(clientY) {
    const top = this.data.scrubberTop
    const h = this.data.scrubberHeight
    const ratio = Math.min(1, Math.max(0, (clientY - top) / h))
    const max = this._maxScroll || 0
    const track = h - 28
    this.setData({ scrubThumbTop: Math.round(ratio * track) })
    wx.pageScrollTo({
      scrollTop: ratio * max,
      duration: 0
    })
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    })
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onSwitchView(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.viewMode) return
    this.setData({ viewMode: mode })
    setTimeout(() => this._measureScrollRange(), 200)
  },

  onPreview(e) {
    const url = e.currentTarget.dataset.url
    const urls = this.data.photos || []
    if (!url) return
    wx.previewImage({ current: url, urls })
  },

  onToggleLike() {
    const id = this.data.styleId
    if (!id) return
    const likes = readLikes()
    likes[id] = !likes[id]
    writeLikes(likes)
    this.setData({ liked: !!likes[id] })
  },

  onOpenShare() {
    this.setData({ shareSheetVisible: true })
  },

  onCloseShare() {
    this.setData({ shareSheetVisible: false })
  },

  onShareMoments() {
    this.setData({ shareSheetVisible: false })
    const id = this.data.styleId
    const cover = this._shareImage()
    if (!id || !cover) {
      wx.showToast({ title: '暂无作品封面', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/poster/select?mode=moments&from=style&id=${encodeURIComponent(id)}`
    })
  },

  noop() {},

  _shareImage() {
    const d = this.data.detail
    if (!d) return ''
    return d.cover || (this.data.photos && this.data.photos[0]) || ''
  },

  _shareTitle() {
    return `${this.data.studioName || '椿屿影像'}的作品`
  },

  onShareAppMessage() {
    if (this.data.shareSheetVisible) this.setData({ shareSheetVisible: false })
    const id = this.data.styleId || ''
    return share.buildShareAppMessage({
      title: this._shareTitle(),
      path: id ? `/pages/detail/detail?id=${id}` : '/pages/index/index',
      imageUrl: this._shareImage()
    })
  },

  onShareTimeline() {
    const id = this.data.styleId || ''
    return share.buildShareTimeline({
      title: this._shareTitle(),
      query: id ? `id=${id}` : '',
      imageUrl: this._shareImage()
    })
  }
})
