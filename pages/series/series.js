const api = require('../../utils/api')
const share = require('../../utils/share')

/** 把封面缩成小图再拉满，形成模糊背景（小程序 CSS filter 对 image 经常无效） */
function makeBlurPath(src) {
  if (!src) return Promise.resolve('')
  return new Promise((resolve) => {
    wx.getImageInfo({
      src,
      success: (info) => {
        try {
          const w = 48
          const h = 48
          const canvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
          const ctx = canvas.getContext('2d')
          const img = canvas.createImage()
          img.onload = () => {
            ctx.drawImage(img, 0, 0, w, h)
            wx.canvasToTempFilePath({
              canvas,
              destWidth: w,
              destHeight: h,
              fileType: 'jpg',
              quality: 0.5,
              success: (r) => resolve(r.tempFilePath || src),
              fail: () => resolve(src)
            })
          }
          img.onerror = () => resolve(src)
          img.src = info.path
        } catch (e) {
          resolve(src)
        }
      },
      fail: () => resolve(src)
    })
  })
}

Page({
  data: {
    seriesId: '',
    filtered: [],
    seriesName: '',
    studioName: '椿屿影像',
    shareCover: '',
    blurCover: '',
    statusBarHeight: 20,
    shareSheetVisible: false,
    refreshing: false
  },

  onLoad(options) {
    share.syncShareMenu()
    const sys = wx.getSystemInfoSync()
    this.setData({
      seriesId: options.id || '',
      statusBarHeight: sys.statusBarHeight || 20
    })
    this.load(options.id)
  },

  async load(seriesId) {
    try {
      const home = await api.getHome()
      const data = await api.getStylesBySeries(seriesId)
      const seriesName = (data.series && data.series.name) || '作品'
      const styles = data.styles || []
      const studioName = (home.studio && home.studio.name) || '椿屿影像'
      const shareCover =
        (data.series && data.series.cover) || (styles[0] && styles[0].cover) || ''
      const coverChanged = shareCover !== this.data.shareCover
      this.setData({
        filtered: styles,
        seriesName,
        studioName,
        shareCover,
        blurCover: coverChanged ? shareCover : this.data.blurCover || shareCover
      })
      // 封面没变就不要重做模糊，避免下拉刷新时顶部闪一下
      if (shareCover && coverChanged) {
        makeBlurPath(shareCover).then((blurCover) => {
          if (blurCover) this.setData({ blurCover })
        })
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onContentUpdated() {
    this.load(this.data.seriesId)
    share.syncShareMenu()
  },

  onRefresh() {
    this.setData({ refreshing: true })
    this.load(this.data.seriesId).finally(() => {
      this.setData({ refreshing: false })
    })
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    })
  },

  onStyleTap(e) {
    wx.navigateTo({
      url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}`
    })
  },

  onOpenShare() {
    this.setData({ shareSheetVisible: true })
  },

  onCloseShare() {
    this.setData({ shareSheetVisible: false })
  },

  onShareMoments() {
    this.setData({ shareSheetVisible: false })
    const id = this.data.seriesId
    if (!id || !this.data.shareCover) {
      wx.showToast({ title: '暂无作品封面', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/poster/select?mode=moments&from=series&id=${encodeURIComponent(id)}`
    })
  },

  noop() {},

  _shareTitle() {
    return `${this.data.studioName || '椿屿影像'}的作品`
  },

  onShareAppMessage() {
    if (this.data.shareSheetVisible) this.setData({ shareSheetVisible: false })
    const id = this.data.seriesId || ''
    return share.buildShareAppMessage({
      title: this._shareTitle(),
      path: id ? `/pages/series/series?id=${id}` : '/pages/index/index',
      imageUrl: this.data.shareCover
    })
  },

  onShareTimeline() {
    const id = this.data.seriesId || ''
    return share.buildShareTimeline({
      title: this._shareTitle(),
      query: id ? `id=${id}` : '',
      imageUrl: this.data.shareCover
    })
  }
})
