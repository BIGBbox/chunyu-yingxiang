const api = require('../../utils/api')
const share = require('../../utils/share')
const feedComments = require('../../utils/feedComments')
const userProfile = require('../../utils/userProfile')

Page({
  data: {
    feed: null,
    studio: { name: '椿屿影像', avatar: '' },
    comments: [],
    commentVisible: false,
    commentDraft: '',
    commentNick: ''
  },

  onLoad(query) {
    this._feedId = (query && query.id) || ''
    share.syncShareMenu()
    this.load()
  },

  onContentUpdated() {
    this.load()
    share.syncShareMenu()
  },

  async load() {
    try {
      const home = await api.getHome()
      const studio = home.studio || {}
      const feed = (home.feeds || []).find((f) => f.id === this._feedId) || null
      const comments = feed ? feedComments.listByFeed(feed.id) : []
      this.setData({
        feed,
        studio: {
          name: studio.name || '椿屿影像',
          avatar: studio.avatar || ''
        },
        comments
      })
      if (!feed) {
        wx.showToast({ title: '动态不存在', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },

  onPreview(e) {
    const { url, urls } = e.currentTarget.dataset
    if (!url) return
    wx.previewImage({ current: url, urls: urls || [url] })
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onBottomShare() {
    /* 动态详情底栏：分享当前动态 */
  },

  onOpenComment() {
    const cached = userProfile.readProfile()
    this.setData({
      commentVisible: true,
      commentDraft: '',
      commentNick: cached.nickName || ''
    })
  },

  onCloseComment() {
    this.setData({ commentVisible: false })
  },

  onCommentInput(e) {
    this.setData({ commentDraft: e.detail.value })
  },

  onSendComment(e) {
    const values = (e.detail && e.detail.value) || {}
    const nick = userProfile.resolveNickFromForm(values)
    const text = String(values.content || this.data.commentDraft || '').trim()
    try {
      feedComments.addComment(this._feedId, text, nick)
      this.setData({
        comments: feedComments.listByFeed(this._feedId),
        commentVisible: false,
        commentDraft: '',
        commentNick: nick === userProfile.DEFAULT_NICK ? this.data.commentNick : nick
      })
      wx.showToast({ title: '已发送', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' })
    }
  },

  onCommentTap(e) {
    const { id, mine } = e.currentTarget.dataset
    if (!id || !(mine === true || mine === 'true')) return
    wx.showActionSheet({
      itemList: ['删除评论'],
      itemColor: '#e64340',
      success: (res) => {
        if (res.tapIndex !== 0) return
        try {
          feedComments.removeComment(this._feedId, id)
          this.setData({ comments: feedComments.listByFeed(this._feedId) })
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
        }
      }
    })
  },

  noop() {},

  onShareAppMessage() {
    const feed = this.data.feed
    const studio = this.data.studio || {}
    const name = studio.name || '椿屿影像'
    if (!feed) {
      return share.buildShareAppMessage({
        title: name,
        path: '/pages/index/index',
        imageUrl: studio.avatar || ''
      })
    }
    return share.buildShareAppMessage({
      title: `${name}的动态`,
      path: `/pages/feed-detail/feed-detail?id=${encodeURIComponent(feed.id)}`,
      imageUrl: (feed.images && feed.images[0]) || studio.avatar || ''
    })
  },

  onShareTimeline() {
    const feed = this.data.feed
    const studio = this.data.studio || {}
    const name = studio.name || '椿屿影像'
    if (!feed) {
      return share.buildShareTimeline({
        title: name,
        imageUrl: studio.avatar || ''
      })
    }
    return share.buildShareTimeline({
      title: `${name}的动态`,
      imageUrl: (feed.images && feed.images[0]) || studio.avatar || '',
      query: `id=${encodeURIComponent(feed.id)}`
    })
  }
})
