const api = require('../../utils/api')
const share = require('../../utils/share')
const feedComments = require('../../utils/feedComments')
const userProfile = require('../../utils/userProfile')

const LIKES_KEY = 'feed_likes_v1'

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

function withFeedExtras(feeds, likedMap) {
  return (feeds || []).map((f) => {
    const comments = feedComments.listByFeed(f.id)
    return {
      ...f,
      liked: !!likedMap[f.id],
      comments: comments.slice(0, 3)
    }
  })
}

Page({
  data: {
    feeds: [],
    likedMap: {},
    studio: {},
    shareSheetVisible: false,
    shareFeedId: '',
    shareFromBar: false,
    focusFeedId: '',
    commentVisible: false,
    commentFeedId: '',
    commentDraft: '',
    commentNick: ''
  },

  onLoad(query) {
    share.syncShareMenu()
    const focusFeedId = (query && query.id) || ''
    this.setData({ focusFeedId })
    this.load()
  },

  onShow() {
    const likedMap = readLikes()
    if (this.data.feeds && this.data.feeds.length) {
      this.setData({
        likedMap,
        feeds: withFeedExtras(this.data.feeds, likedMap)
      })
    }
  },

  onContentUpdated() {
    this.load()
    share.syncShareMenu()
  },

  async load() {
    try {
      const data = await api.getHome()
      const likedMap = readLikes()
      const feeds = withFeedExtras(data.feeds || [], likedMap)
      this.setData({
        feeds,
        likedMap,
        studio: data.studio || {}
      })
      this._scrollToFocus()
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  _scrollToFocus() {
    const id = this.data.focusFeedId
    if (!id) return
    // 等列表渲染后再滚到对应动态
    setTimeout(() => {
      const q = wx.createSelectorQuery()
      q.select(`#feed-${id}`).boundingClientRect()
      q.selectViewport().scrollOffset()
      q.exec((res) => {
        const rect = res && res[0]
        const scroll = res && res[1]
        if (!rect || !scroll) return
        wx.pageScrollTo({
          scrollTop: Math.max(0, scroll.scrollTop + rect.top - 24),
          duration: 300
        })
      })
    }, 200)
  },

  onPreviewFeed(e) {
    const { url, urls } = e.currentTarget.dataset
    if (!url) return
    wx.previewImage({ current: url, urls: urls || [url] })
  },

  onFeedTextTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/feed-detail/feed-detail?id=${encodeURIComponent(id)}` })
  },

  onFeedComment(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this._openComment(id)
  },

  onCommentLineTap(e) {
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
            this.setData({ feeds: withFeedExtras(this.data.feeds, likedMap) })
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
    const feedId = this.data.commentFeedId
    const values = (e.detail && e.detail.value) || {}
    const nick = userProfile.resolveNickFromForm(values)
    const text = String(values.content || this.data.commentDraft || '').trim()
    try {
      feedComments.addComment(feedId, text, nick)
      const likedMap = this.data.likedMap || {}
      this.setData({
        feeds: withFeedExtras(this.data.feeds, likedMap),
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
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onBottomShare() {
    // 列表页底栏：分享小程序首页
    this.setData({ shareFeedId: '', shareFromBar: true, shareSheetVisible: false })
  },

  onFeedLike(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const likedMap = { ...(this.data.likedMap || {}) }
    likedMap[id] = !likedMap[id]
    this.setData({
      likedMap,
      feeds: withFeedExtras(this.data.feeds, likedMap)
    })
    writeLikes(likedMap)
  },

  onFeedShare(e) {
    this.setData({
      shareSheetVisible: true,
      shareFeedId: e.currentTarget.dataset.id || '',
      shareFromBar: false
    })
  },

  onCloseShareSheet() {
    this.setData({ shareSheetVisible: false })
  },

  onShareMomentsTip() {
    const id = this.data.shareFeedId
    this.setData({ shareSheetVisible: false })
    if (!id) {
      wx.showToast({ title: '未找到动态', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/poster/feed?id=${encodeURIComponent(id)}` })
  },

  noop() {},

  onShareAppMessage() {
    const feeds = this.data.feeds || []
    const studio = this.data.studio || {}
    const fromBar = this.data.shareFromBar
    const feed = fromBar ? null : feeds.find((f) => f.id === this.data.shareFeedId)
    if (this.data.shareSheetVisible) this.setData({ shareSheetVisible: false })
    if (fromBar) this.setData({ shareFromBar: false })
    const name = studio.name || '椿屿影像'
    if (feed) {
      return share.buildShareAppMessage({
        title: `${name}的动态`,
        path: `/pages/feed-detail/feed-detail?id=${encodeURIComponent(feed.id)}`,
        imageUrl: (feed.images && feed.images[0]) || studio.avatar || ''
      })
    }
    return share.buildShareAppMessage({
      title: name,
      path: '/pages/index/index',
      imageUrl: studio.avatar || ''
    })
  },

  onShareTimeline() {
    const studio = this.data.studio || {}
    const feeds = this.data.feeds || []
    const feed = feeds.find((f) => f.id === this.data.shareFeedId)
    const name = studio.name || '椿屿影像'
    return share.buildShareTimeline({
      title: feed ? `${name}的动态` : name,
      imageUrl: studio.avatar || (feed && feed.images && feed.images[0]) || '',
      query: feed ? `id=${encodeURIComponent(feed.id)}` : ''
    })
  }
})
