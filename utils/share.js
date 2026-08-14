/**
 * 小程序分享：按 content.settings.shareEnabled 打开或关闭菜单。
 * 页面仍需声明 onShareAppMessage / onShareTimeline；关闭时会 hideShareMenu。
 */

function isShareEnabled(settings) {
  if (!settings || settings.shareEnabled == null) return true
  const v = settings.shareEnabled
  return v === true || v === 'true' || v === 1 || v === '1'
}

function applyShareMenu(enabled) {
  try {
    if (enabled) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline']
      })
    } else {
      wx.hideShareMenu({
        menus: ['shareAppMessage', 'shareTimeline']
      })
    }
  } catch (e) {
    /* 低版本忽略 */
  }
}

/** 从已加载内容同步菜单；无缓存时拉一次 content */
function syncShareMenu() {
  const api = require('./api')
  return api
    .loadContent()
    .then((data) => {
      const on = isShareEnabled(data && data.settings)
      applyShareMenu(on)
      return on
    })
    .catch(() => {
      applyShareMenu(true)
      return true
    })
}

/**
 * @param {{ title?: string, path?: string, imageUrl?: string }} opts
 */
function buildShareAppMessage(opts) {
  const o = opts || {}
  const out = {
    title: o.title || '椿屿影像',
    path: o.path || '/pages/index/index'
  }
  if (o.imageUrl) out.imageUrl = o.imageUrl
  return out
}

/**
 * @param {{ title?: string, query?: string, imageUrl?: string }} opts
 */
function buildShareTimeline(opts) {
  const o = opts || {}
  const out = {
    title: o.title || '椿屿影像'
  }
  if (o.query) out.query = o.query
  if (o.imageUrl) out.imageUrl = o.imageUrl
  return out
}

module.exports = {
  isShareEnabled,
  applyShareMenu,
  syncShareMenu,
  buildShareAppMessage,
  buildShareTimeline
}
