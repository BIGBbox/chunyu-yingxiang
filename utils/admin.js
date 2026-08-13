const conf = require('../config')
const cosUtil = require('./cos')

let _authCache = null // { isAdmin, openid }

/** 是否启用了云端管理员鉴权（配置了 SCF 地址） */
function authEnabled() {
  return !!(conf.adminAuth && conf.adminAuth.enabled && conf.adminAuth.apiUrl)
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (r) => (r && r.code ? resolve(r.code) : reject(new Error('wx.login 未返回 code'))),
      fail: (err) => reject(err)
    })
  })
}

function unwrapAuthPayload(raw) {
  if (!raw) return {}
  let data = raw
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (e) {
      return {}
    }
  }
  // 函数 URL 可能包一层 { statusCode, body }
  if (data.isAdmin == null && data.openid == null && data.body != null) {
    try {
      const inner = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
      if (inner && typeof inner === 'object') data = inner
    } catch (e) {
      /* keep outer */
    }
  }
  return data
}

function requestAuth(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: conf.adminAuth.apiUrl,
      method: 'POST',
      data: { code },
      header: { 'content-type': 'application/json' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          resolve(unwrapAuthPayload(res.data))
        } else {
          reject(new Error(`鉴权服务返回 HTTP ${res.statusCode}`))
        }
      },
      fail: (err) => reject(err)
    })
  })
}

/** 把 SCF 下发的 COS 写入本机并设为当前配置（覆盖同桶旧项） */
function applyServerCos(cos) {
  if (!cos || !cos.SecretId || !cos.SecretKey || !cos.Bucket || !cos.Region) return false
  const store = cosUtil.listProfiles()
  const existing = store.list.find(
    (p) => p.Bucket === cos.Bucket && p.Region === cos.Region
  )
  const saved = cosUtil.saveProfile({
    id: existing ? existing.id : undefined,
    name: cos.name || '默认配置',
    Bucket: cos.Bucket,
    Region: cos.Region,
    SecretId: cos.SecretId,
    SecretKey: cos.SecretKey,
    baseUrl: String(cos.baseUrl || '').replace(/\/$/, '')
  })
  cosUtil.setActiveProfile(saved.id)
  return true
}

/**
 * 校验当前用户是否管理员。
 * 未启用鉴权时返回 { isAdmin:true, bypass:true } 以便开发期直接进入。
 * 校验成功且服务端下发了完整 COS 时，自动写入本机，无需手填。
 */
function checkAdmin(force) {
  if (!authEnabled()) {
    return Promise.resolve({ isAdmin: true, openid: '', bypass: true })
  }
  if (!force && _authCache) return Promise.resolve(_authCache)

  return wxLogin()
    .then((code) => requestAuth(code))
    .then((data) => {
      const result = {
        isAdmin: !!data.isAdmin,
        openid: data.openid || '',
        error: data.error || '',
        cosApplied: false,
        cosImported: false
      }
      if (result.isAdmin && data.cos) {
        const hadCreds = cosUtil.hasCosCredentials()
        try {
          result.cosApplied = applyServerCos(data.cos)
          result.cosImported = result.cosApplied && !hadCreds
        } catch (e) {
          result.cosApplied = false
        }
      }
      _authCache = result
      return result
    })
}

function clearAuthCache() {
  _authCache = null
}

module.exports = {
  authEnabled,
  checkAdmin,
  applyServerCos,
  clearAuthCache
}
