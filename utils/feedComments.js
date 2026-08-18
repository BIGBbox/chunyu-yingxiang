/**
 * 动态评论：本机 Storage，头像固定用默认图
 * 本机发出的评论标记 mine，可点选删除；昵称用微信授权名
 */
const KEY = 'feed_comments_v1'

function readAll() {
  try {
    const raw = wx.getStorageSync(KEY)
    return raw && typeof raw === 'object' ? raw : {}
  } catch (e) {
    return {}
  }
}

function writeAll(map) {
  try {
    wx.setStorageSync(KEY, map)
  } catch (e) {
    /* ignore */
  }
}

function listByFeed(feedId) {
  const all = readAll()
  const list = (all && all[feedId]) || []
  if (!Array.isArray(list)) return []
  // 本机发出的评论可删（兼容旧数据无 mine）
  return list.map((c) => ({
    ...c,
    mine: c.mine !== false
  }))
}

function addComment(feedId, text, nickName) {
  const content = String(text || '').trim()
  if (!feedId || !content) throw new Error('请输入评论内容')
  const nick = String(nickName || '').trim() || '微信用户'
  const all = readAll()
  const list = Array.isArray(all[feedId]) ? all[feedId].slice() : []
  const item = {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    nick: nick.slice(0, 32),
    text: content.slice(0, 200),
    createdAt: Date.now(),
    mine: true
  }
  list.unshift(item)
  all[feedId] = list
  writeAll(all)
  return item
}

function removeComment(feedId, commentId) {
  if (!feedId || !commentId) throw new Error('评论不存在')
  const all = readAll()
  const list = Array.isArray(all[feedId]) ? all[feedId] : []
  const target = list.find((c) => c && c.id === commentId)
  if (!target || target.mine === false) throw new Error('只能删除自己的评论')
  all[feedId] = list.filter((c) => c && c.id !== commentId)
  writeAll(all)
}

module.exports = {
  listByFeed,
  addComment,
  removeComment
}
