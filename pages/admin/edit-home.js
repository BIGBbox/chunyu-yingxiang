const api = require('../../utils/api')
const cosUtil = require('../../utils/cos')

function emptyCover() {
  return { type: 'image', url: '', poster: '' }
}

function padCovers(list) {
  const arr = (list || []).slice(0, 5).map((c) => ({
    type: c && c.type === 'video' ? 'video' : 'image',
    url: (c && c.url) || '',
    poster: (c && c.poster) || ''
  }))
  while (arr.length < 5) arr.push(emptyCover())
  return arr
}

function tagsToText(tags) {
  return (tags || []).join(',')
}

function textToTags(text) {
  return String(text || '')
    .split(/[,，\n]/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
}

Page({
  data: {
    covers: padCovers([]),
    studio: {
      name: '椿屿影像',
      intro: '',
      tags: [],
      phone: '',
      latitude: '',
      longitude: '',
      address: '',
      oaLink: '',
      wxacode: ''
    },
    tagsText: ''
  },

  onLoad() {
    this.load()
  },

  async load() {
    wx.showLoading({ title: '加载中' })
    try {
      const all = await api.getAll()
      const home = all.home || {}
      const studio = home.studio || {}
      this.setData({
        covers: padCovers(home.covers),
        studio: {
          name: studio.name || '椿屿影像',
          intro: studio.intro || '',
          tags: studio.tags || [],
          phone: studio.phone || '',
          latitude: studio.latitude != null ? String(studio.latitude) : '',
          longitude: studio.longitude != null ? String(studio.longitude) : '',
          address: studio.address || '',
          oaLink: studio.oaLink || '',
          avatar: studio.avatar || '',
          wxacode: studio.wxacode || ''
        },
        tagsText: tagsToText(studio.tags)
      })
      wx.hideLoading()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },

  onStudioInput(e) {
    this.setData({ [`studio.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onTagsInput(e) {
    this.setData({ tagsText: e.detail.value })
  },

  onChooseLocation() {
    wx.chooseLocation({
      latitude: Number(this.data.studio.latitude) || undefined,
      longitude: Number(this.data.studio.longitude) || undefined,
      success: (res) => {
        const name = res.name || ''
        const address = res.address || ''
        const display = [name, address].filter(Boolean).join(' ') || address || name
        this.setData({
          'studio.latitude': String(res.latitude),
          'studio.longitude': String(res.longitude),
          'studio.address': display
        })
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (msg.includes('cancel') || msg.includes('取消')) return
        // 未授权时引导
        if (msg.includes('auth deny') || msg.includes('authorize')) {
          wx.showModal({
            title: '需要位置权限',
            content: '请在设置中允许使用位置信息，以便地图选点。',
            confirmText: '去设置',
            success: (r) => {
              if (r.confirm) wx.openSetting({})
            }
          })
          return
        }
        wx.showToast({ title: '选点失败，请重试', icon: 'none' })
      }
    })
  },

  onUploadCover(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    cosUtil
      .chooseAndUpload(1, 'home/covers', { mediaType: ['image', 'video'] })
      .then((items) => {
        const item = items[0]
        if (!item) return
        const covers = this.data.covers.slice()
        covers[index] = {
          type: item.type === 'video' ? 'video' : 'image',
          url: item.url,
          poster: item.poster || ''
        }
        this.setData({ covers })
      })
      .catch((err) => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return
        wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
      })
  },

  onClearCover(e) {
    const index = Number(e.currentTarget.dataset.index)
    const covers = this.data.covers.slice()
    covers[index] = emptyCover()
    this.setData({ covers })
  },

  onUploadAvatar() {
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    cosUtil
      .chooseAndUpload(1, 'home/avatar')
      .then((urls) => {
        if (urls && urls[0]) this.setData({ 'studio.avatar': urls[0] })
      })
      .catch((err) => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return
        wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
      })
  },

  onClearAvatar() {
    this.setData({ 'studio.avatar': '' })
  },

  onUploadWxacode() {
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    cosUtil
      .chooseAndUpload(1, 'home/wxacode')
      .then((urls) => {
        if (urls && urls[0]) this.setData({ 'studio.wxacode': urls[0] })
      })
      .catch((err) => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return
        wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
      })
  },

  onClearWxacode() {
    this.setData({ 'studio.wxacode': '' })
  },

  onSave() {
    if (!cosUtil.hasCosCredentials()) {
      wx.showToast({ title: '请先配置 COS', icon: 'none' })
      return
    }
    const s = this.data.studio
    const lat = Number(s.latitude)
    const lng = Number(s.longitude)
    wx.showLoading({ title: '保存中', mask: true })
    api
      .getAll()
      .then((all) => {
        all.home = all.home || {}
        all.home.covers = padCovers(this.data.covers)
        all.home.studio = {
          name: (s.name || '').trim() || '椿屿影像',
          intro: s.intro || '',
          tags: textToTags(this.data.tagsText),
          phone: (s.phone || '').trim(),
          latitude: Number.isFinite(lat) ? lat : 0,
          longitude: Number.isFinite(lng) ? lng : 0,
          address: s.address || '',
          oaLink: (s.oaLink || '').trim(),
          avatar: (s.avatar || '').trim(),
          wxacode: (s.wxacode || '').trim()
        }
        if (!Array.isArray(all.home.feeds)) all.home.feeds = []
        return api.saveAll(all)
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
      })
      .catch((e) => {
        wx.hideLoading()
        wx.showToast({ title: (e && e.message) || '失败', icon: 'none' })
      })
  }
})
