const api = require('../../utils/api')
const admin = require('../../utils/admin')
const cosUtil = require('../../utils/cos')
const share = require('../../utils/share')
const feedComments = require('../../utils/feedComments')
const userProfile = require('../../utils/userProfile')
const { adminTapCount } = require('../../config')

const LIKES_KEY = 'feed_likes_v1'
const FEED_PREVIEW = 3

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

function withFeedExtras(feeds, likedMap, commentEnabled) {
  return (feeds || []).map((f) => {
    const comments = commentEnabled ? feedComments.listByFeed(f.id).slice(0, 3) : []
    return {
      ...f,
      liked: !!likedMap[f.id],
      comments
    }
  })
}

Page({
  data: {
    coverHeight: 560,
    coverIndex: 0,
    covers: [],
    currentIsVideo: false,
    videoMuted: true,
    videoPlaying: false,
    videoFading: false,
    videoFullscreen: false,
    swiperAutoplay: true,
    studio: {
      name: '椿屿影像',
      intro: '',
      tags: [],
      phone: '',
      latitude: 0,
      longitude: 0,
      address: ''
    },
    seriesList: [],
    feeds: [],
    previewFeeds: [],
    likedMap: {},
    shareSheetVisible: false,
    shareFeedId: '',
    shareFromBar: false,
    commentVisible: false,
    commentFeedId: '',
    commentDraft: '',
    commentNick: '',
    commentEnabled: false
  },

  _titleTap: 0,
  _titleTapTimer: null,
  _fadeTimer: null,
  _advancingAfterVideo: false,

  onLoad() {
    const sys = wx.getSystemInfoSync()
    // 导航栏下方内容区约 70%，不侵入刘海
    const coverHeight = Math.round((sys.windowHeight || 700) * 0.7)
    this.setData({ coverHeight, likedMap: readLikes() })
    share.syncShareMenu()
    this.loadHome()
  },

  onUnload() {
    clearTimeout(this._fadeTimer)
  },

  onShow() {
    // 从详情页返回时刷新评论摘要
    if (this.data.feeds && this.data.feeds.length) {
      const likedMap = readLikes()
      const feeds = withFeedExtras(this.data.feeds, likedMap, this.data.commentEnabled)
      this.setData({
        likedMap,
        feeds,
        previewFeeds: feeds.slice(0, FEED_PREVIEW)
      })
    }
  },

  onPullDownRefresh() {
    api
      .loadContent(true)
      .then(() => this.loadHome())
      .finally(() => wx.stopPullDownRefresh())
  },

  onContentUpdated() {
    this.loadHome()
    share.syncShareMenu()
  },

  async loadHome() {
    try {
      const data = await api.getHome()
      const covers = data.covers || []
      const likedMap = readLikes()
      const commentEnabled = !!data.commentEnabled
      const feeds = withFeedExtras(data.feeds || [], likedMap, commentEnabled)
      this.setData({
        covers,
        coverIndex: 0,
        videoFading: false,
        studio: data.studio || this.data.studio,
        seriesList: data.seriesList || [],
        feeds,
        previewFeeds: feeds.slice(0, FEED_PREVIEW),
        likedMap,
        commentEnabled
      })
      this._applyCoverState(0, { autoPlayVideo: true })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onCoverChange(e) {
    const idx = e.detail.current || 0
    // 程序切页触发的 change：跳过重复处理
    if (this._advancingAfterVideo) {
      this._advancingAfterVideo = false
      this.setData({ coverIndex: idx })
      this._applyCoverState(idx, { autoPlayVideo: true })
      return
    }
    clearTimeout(this._fadeTimer)
    this.setData({ coverIndex: idx, videoFading: false })
    this._applyCoverState(idx, { autoPlayVideo: true })
  },

  /** 视频播完：渐隐 → 暂停 → 切下一张 → 下次轮到再播 */
  onVideoEnded(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index !== this.data.coverIndex) return
    if (this.data.videoFading) return

    this.setData({ videoPlaying: false, videoFading: true })
    const ctx = wx.createVideoContext(`coverVideo${index}`, this)
    try {
      ctx.pause()
      ctx.seek(0)
    } catch (err) {
      /* ignore */
    }

    clearTimeout(this._fadeTimer)
    this._fadeTimer = setTimeout(() => {
      const covers = this.data.covers || []
      if (!covers.length) return
      const next = (index + 1) % covers.length
      this.setData({ videoFading: false })
      if (next === index) {
        // 仅一张封面：回到片头再播
        this._applyCoverState(index, { autoPlayVideo: true })
        return
      }
      this._advancingAfterVideo = true
      this.setData({ coverIndex: next })
      this._applyCoverState(next, { autoPlayVideo: true })
    }, 480)
  },

  _applyCoverState(activeIndex, opts) {
    const covers = this.data.covers || []
    const cur = covers[activeIndex]
    const isVideo = !!(cur && cur.type === 'video')
    // 视频播放期间关闭轮播；图片才自动切换
    this.setData({
      currentIsVideo: isVideo,
      swiperAutoplay: !isVideo && covers.length > 1,
      videoPlaying: false,
      videoFading: false
    })
    covers.forEach((c, i) => {
      if (c.type !== 'video') return
      const ctx = wx.createVideoContext(`coverVideo${i}`, this)
      try {
        if (i === activeIndex && isVideo && opts && opts.autoPlayVideo) {
          ctx.seek(0)
          ctx.play()
          this.setData({ videoPlaying: true })
        } else {
          ctx.pause()
          ctx.seek(0)
        }
      } catch (e) {
        /* ignore */
      }
    })
  },

  onCoverTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index !== this.data.coverIndex) return
    if (this.data.videoFading) return
    const cur = (this.data.covers || [])[index]
    if (!cur || cur.type !== 'video') return
    const ctx = wx.createVideoContext(`coverVideo${index}`, this)
    if (this.data.videoPlaying) {
      try {
        ctx.pause()
      } catch (err) {
        /* ignore */
      }
      // 手动暂停后恢复图片轮播
      this.setData({
        videoPlaying: false,
        swiperAutoplay: (this.data.covers || []).length > 1
      })
    } else {
      try {
        ctx.play()
      } catch (err) {
        /* ignore */
      }
      this.setData({ videoPlaying: true, swiperAutoplay: false })
    }
  },

  onToggleMute() {
    const next = !this.data.videoMuted
    this.setData({ videoMuted: next })
    if (this.data.currentIsVideo && this.data.videoPlaying) {
      const idx = this.data.coverIndex
      const ctx = wx.createVideoContext(`coverVideo${idx}`, this)
      try {
        ctx.play()
      } catch (e) {
        /* ignore */
      }
    }
  },

  /** 视频封面：右上角全屏按钮；direction 0=竖屏全屏，横屏素材可改 90 */
  onToggleFullscreen() {
    if (!this.data.currentIsVideo || this.data.videoFading) return
    const idx = this.data.coverIndex
    const ctx = wx.createVideoContext(`coverVideo${idx}`, this)
    if (!ctx) return
    try {
      ctx.requestFullScreen({ direction: 0 })
    } catch (e) {
      /* ignore */
    }
  },

  /** 全屏状态变化：全屏时开控制条（自带退出按钮），退出后恢复简洁无控制条 */
  onVideoFullscreenChange(e) {
    const full = !!(e.detail && e.detail.fullScreen)
    this.setData({ videoFullscreen: full })
  },

  onPhoneTap() {
    const phone = (this.data.studio && this.data.studio.phone) || ''
    if (!phone) {
      wx.showToast({ title: '暂无电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: String(phone) })
  },

  onLocationTap() {
    const s = this.data.studio || {}
    const lat = Number(s.latitude)
    const lng = Number(s.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) {
      wx.showToast({ title: '暂未配置位置', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: s.name || '椿屿影像',
      address: s.address || '',
      scale: 16
    })
  },

  onSeriesTap(e) {
    wx.navigateTo({ url: `/pages/series/series?id=${e.currentTarget.dataset.id}` })
  },

  onWorksTap() {
    const list = this.data.seriesList || []
    if (!list.length) return
    // 多系列时进第一个；单系列同样进入作品列表页
    wx.navigateTo({ url: `/pages/series/series?id=${list[0].id}` })
  },

  onMoreFeeds() {
    wx.navigateTo({ url: '/pages/feeds/feeds' })
  },

  onFeedTextTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/feed-detail/feed-detail?id=${encodeURIComponent(id)}` })
  },

  onFeedComment(e) {
    const id = e.currentTarget.dataset.id
    if (!id || !this.data.commentEnabled) return
    this._openComment(id)
  },

  onCommentLineTap(e) {
    if (!this.data.commentEnabled) return
    const { feedId, cid, mine } = e.currentTarget.dataset
    if (!feedId) return
    if (mine === true || mine === 'true') {
      wx.showActionSheet({
        itemList: ['删除评论'],
        itemColor: '#e64340',
        success: (res) => {
          if (res.tapIndex !== 0) return
          try {
            feedComments.removeComment(feedId, cid)
            const likedMap = this.data.likedMap || {}
            const feeds = withFeedExtras(this.data.feeds, likedMap, this.data.commentEnabled)
            this.setData({
              feeds,
              previewFeeds: feeds.slice(0, FEED_PREVIEW)
            })
          } catch (err) {
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
          }
        }
      })
      return
    }
    this._openComment(feedId)
  },

  _openComment(feedId) {
    if (!this.data.commentEnabled || !feedId) return
    const cached = userProfile.readProfile()
    this.setData({
      commentFeedId: feedId,
      commentVisible: true,
      commentDraft: '',
      commentNick: cached.nickName || ''
    })
  },

  onCloseComment() {
    this.setData({ commentVisible: false, commentFeedId: '', commentDraft: '' })
  },

  onCommentInput(e) {
    this.setData({ commentDraft: e.detail.value })
  },

  onSendComment(e) {
    if (!this.data.commentEnabled) return
    const feedId = this.data.commentFeedId
    const values = (e.detail && e.detail.value) || {}
    const nick = userProfile.resolveNickFromForm(values)
    const text = String(values.content || this.data.commentDraft || '').trim()
    try {
      feedComments.addComment(feedId, text, nick)
      const likedMap = this.data.likedMap || {}
      const feeds = withFeedExtras(this.data.feeds, likedMap, this.data.commentEnabled)
      this.setData({
        feeds,
        previewFeeds: feeds.slice(0, FEED_PREVIEW),
        commentVisible: false,
        commentFeedId: '',
        commentDraft: '',
        commentNick: nick === userProfile.DEFAULT_NICK ? this.data.commentNick : nick
      })
      wx.showToast({ title: '已发送', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' })
    }
  },

  onBottomHome() {
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  onBottomShare() {
    // 主页底栏：分享小程序首页
    this.setData({ shareFeedId: '', shareFromBar: true, shareSheetVisible: false })
  },

  onPreviewFeed(e) {
    const { url, urls } = e.currentTarget.dataset
    if (!url) return
    wx.previewImage({ current: url, urls: urls || [url] })
  },

  onFeedLike(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const likedMap = { ...(this.data.likedMap || {}) }
    likedMap[id] = !likedMap[id]
    const feeds = withFeedExtras(this.data.feeds, likedMap, this.data.commentEnabled)
    this.setData({
      likedMap,
      feeds,
      previewFeeds: feeds.slice(0, FEED_PREVIEW)
    })
    writeLikes(likedMap)
  },

  onStudioShare() {
    // 工作室分享：小程序首页
    this.setData({ shareSheetVisible: true, shareFeedId: '', shareFromBar: false })
  },

  onFeedShare(e) {
    // 动态分享：指定该条动态
    const id = e.currentTarget.dataset.id || ''
    this.setData({ shareSheetVisible: true, shareFeedId: id, shareFromBar: false })
  },

  onCloseShareSheet() {
    this.setData({ shareSheetVisible: false })
  },

  onShareMomentsTip() {
    this.setData({ shareSheetVisible: false })
    const feedId = this.data.shareFeedId
    if (feedId) {
      wx.navigateTo({
        url: `/pages/poster/feed?id=${encodeURIComponent(feedId)}`
      })
      return
    }
    wx.navigateTo({ url: '/pages/poster/select?mode=moments' })
  },

  onSharePoster() {
    this.setData({ shareSheetVisible: false })
    wx.navigateTo({ url: '/pages/poster/select?mode=poster' })
  },

  onShareOaLink() {
    this.setData({ shareSheetVisible: false })
    const link = (this.data.studio && this.data.studio.oaLink) || ''
    if (!link) {
      wx.showToast({ title: '暂未配置公众号链接', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: link,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    })
  },

  noop() {},

  onTitleTap() {
    this._titleTap += 1
    clearTimeout(this._titleTapTimer)
    this._titleTapTimer = setTimeout(() => {
      this._titleTap = 0
    }, 1500)
    if (this._titleTap >= adminTapCount) {
      this._titleTap = 0
      this.enterAdmin()
    }
  },

  async enterAdmin() {
    if (this._entering) return
    if (!admin.authEnabled()) {
      wx.navigateTo({ url: '/pages/admin/index' })
      return
    }
    this._entering = true
    try {
      const res = await admin.checkAdmin(true)
      if (res.isAdmin) {
        if (res.cosImported) {
          wx.showToast({ title: '已同步 COS 配置', icon: 'success' })
        } else if (!cosUtil.hasCosCredentials()) {
          wx.showToast({ title: '服务端未下发完整 COS', icon: 'none' })
        }
        wx.navigateTo({ url: '/pages/admin/index' })
        return
      }
      if (res.openid) {
        try {
          await new Promise((resolve, reject) => {
            wx.setClipboardData({
              data: res.openid,
              success: resolve,
              fail: reject
            })
          })
        } catch (e) {
          /* 复制失败仍继续 */
        }
      }
    } catch (e) {
      /* 静默 */
    } finally {
      this._entering = false
    }
  },

  onShareAppMessage() {
    const studio = this.data.studio || {}
    const covers = this.data.covers || []
    const feeds = this.data.feeds || []
    const feedId = this.data.shareFeedId
    const feed = feedId ? feeds.find((f) => f.id === feedId) : null
    const fromBar = this.data.shareFromBar
    if (this.data.shareSheetVisible) {
      this.setData({ shareSheetVisible: false })
    }
    if (fromBar) {
      this.setData({ shareFromBar: false })
    }
    if (feed && !fromBar) {
      const name = studio.name || '椿屿影像'
      return share.buildShareAppMessage({
        title: `${name}的动态`,
        path: `/pages/feed-detail/feed-detail?id=${encodeURIComponent(feed.id)}`,
        imageUrl: (feed.images && feed.images[0]) || studio.avatar || ''
      })
    }
    const imageUrl =
      studio.avatar ||
      (covers[0] && covers[0].type === 'image' && covers[0].url) ||
      (covers[0] && covers[0].poster) ||
      ''
    return share.buildShareAppMessage({
      title: studio.name || '椿屿影像',
      path: '/pages/index/index',
      imageUrl
    })
  },

  onShareTimeline() {
    const studio = this.data.studio || {}
    const covers = this.data.covers || []
    const imageUrl =
      studio.avatar ||
      (covers[0] && covers[0].type === 'image' && covers[0].url) ||
      (covers[0] && covers[0].poster) ||
      ''
    return share.buildShareTimeline({
      title: studio.name || '椿屿影像',
      imageUrl
    })
  }
})
