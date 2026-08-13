const COS = require('../libs/cos-wx-sdk-v5')
const conf = require('../config')

const STORAGE_KEY = 'cos_admin_conf' // 旧版单配置，保留用于兼容与迁移
const PROFILES_KEY = 'cos_admin_profiles' // 新版多配置：{ activeId, list: [] }

const PROFILE_FIELDS = ['Bucket', 'Region', 'SecretId', 'SecretKey', 'baseUrl']

function genProfileId() {
  return `cos_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

function normalizeProfile(raw = {}) {
  return {
    id: raw.id || genProfileId(),
    name: (raw.name || '').trim() || raw.Bucket || '未命名配置',
    Bucket: raw.Bucket || '',
    Region: raw.Region || '',
    SecretId: raw.SecretId || '',
    SecretKey: raw.SecretKey || '',
    baseUrl: String(raw.baseUrl || '').replace(/\/$/, '')
  }
}

function writeProfiles(store) {
  const list = (store.list || []).map(normalizeProfile)
  const activeId = list.some((p) => p.id === store.activeId)
    ? store.activeId
    : (list[0] && list[0].id) || ''
  const next = { activeId, list }
  wx.setStorageSync(PROFILES_KEY, next)

  // 同步激活项到旧 key 与 globalData，保证其余逻辑与历史数据兼容
  const active = list.find((p) => p.id === activeId)
  if (active) {
    wx.setStorageSync(STORAGE_KEY, { ...active })
    const app = getApp()
    if (app && active.baseUrl) app.globalData.baseUrl = active.baseUrl
  } else {
    wx.removeStorageSync(STORAGE_KEY)
  }
  return next
}

/** 读取全部配置；首次会把旧版单配置迁移成一条 */
function listProfiles() {
  let store = null
  try {
    store = wx.getStorageSync(PROFILES_KEY)
  } catch (e) {
    store = null
  }
  if (store && Array.isArray(store.list)) {
    return { activeId: store.activeId || '', list: store.list.map(normalizeProfile) }
  }

  let legacy = {}
  try {
    legacy = wx.getStorageSync(STORAGE_KEY) || {}
  } catch (e) {
    legacy = {}
  }
  if (legacy && PROFILE_FIELDS.some((f) => legacy[f])) {
    const migrated = normalizeProfile({ ...legacy, name: legacy.Bucket || '默认配置' })
    return writeProfiles({ activeId: migrated.id, list: [migrated] })
  }
  return { activeId: '', list: [] }
}

/** 当前激活配置（无配置时返回空对象，调用方按原逻辑判空） */
function getAdminConf() {
  const { activeId, list } = listProfiles()
  const active = list.find((p) => p.id === activeId) || list[0]
  return active ? { ...active } : {}
}

/** 新增或更新一条配置；返回保存后的配置 */
function saveProfile(profile) {
  const store = listProfiles()
  const next = normalizeProfile(profile)
  const idx = store.list.findIndex((p) => p.id === next.id)
  if (idx >= 0) {
    store.list[idx] = next
  } else {
    store.list.push(next)
  }
  if (!store.activeId) store.activeId = next.id
  writeProfiles(store)
  return next
}

/** 删除一条配置；若删的是激活项则自动激活剩余第一条 */
function removeProfile(id) {
  const store = listProfiles()
  store.list = store.list.filter((p) => p.id !== id)
  if (store.activeId === id) store.activeId = ''
  return writeProfiles(store)
}

/** 切换激活配置 */
function setActiveProfile(id) {
  const store = listProfiles()
  if (!store.list.some((p) => p.id === id)) {
    throw new Error('配置不存在')
  }
  store.activeId = id
  return writeProfiles(store)
}

/** 更新激活配置的部分字段（兼容旧调用） */
function saveAdminConf(data) {
  const current = getAdminConf()
  return saveProfile({ ...current, ...data })
}

/** 清除本机所有 COS 配置 */
function clearAdminConf() {
  wx.removeStorageSync(PROFILES_KEY)
  wx.removeStorageSync(STORAGE_KEY)
}

/** config.js 里的静态域名：游客端唯一的读取来源 */
function getGuestBaseUrl() {
  return String(conf.baseUrl || '').replace(/\/$/, '')
}

/**
 * config.js 的 baseUrl 是否已换成真实域名。
 * 仍是占位/示例时，其他用户只能看到打包进小程序的演示数据。
 */
function isGuestBaseUrlReady() {
  const base = getGuestBaseUrl()
  if (!base) return false
  return !/^https:\/\/demo-|你的桶|your-bucket|example/i.test(base)
}

function getBaseUrl() {
  const admin = getAdminConf()
  const fromAdmin = (admin.baseUrl || '').replace(/\/$/, '')
  return fromAdmin || getGuestBaseUrl() || ''
}

/** 运行环境：develop（开发版）/ trial（体验版）/ release（正式版） */
function getEnvVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion || ''
  } catch (e) {
    return ''
  }
}

function getContentPath() {
  return conf.contentPath || 'data/content.json'
}

function contentUrl() {
  const base = getBaseUrl()
  if (!base) return ''
  return `${base}/${getContentPath()}?t=${Date.now()}`
}

function hasCosCredentials() {
  const c = getAdminConf()
  return !!(c.SecretId && c.SecretKey && c.Bucket && c.Region)
}

function createCos() {
  const c = getAdminConf()
  if (!c.SecretId || !c.SecretKey) {
    throw new Error('请先在管理设置中填写 COS SecretId / SecretKey')
  }
  return new COS({
    SecretId: c.SecretId,
    SecretKey: c.SecretKey
  })
}

function publicUrl(Key) {
  const base = getBaseUrl()
  if (!base) throw new Error('未配置 COS 访问域名 baseUrl')
  return `${base}/${Key.replace(/^\//, '')}`
}

/**
 * 上传本地文件到 COS
 * @returns {Promise<string>} 公网 URL
 */
function uploadFile(filePath, Key) {
  return new Promise((resolve, reject) => {
    const c = getAdminConf()
    if (!hasCosCredentials()) {
      reject(new Error('请先配置 COS 密钥'))
      return
    }
    const cos = createCos()
    cos.uploadFile(
      {
        Bucket: c.Bucket,
        Region: c.Region,
        Key,
        FilePath: filePath,
        SliceSize: 1024 * 1024 * 5
      },
      (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve(publicUrl(Key))
      }
    )
  })
}

function chooseAndUpload(count = 9, dir = 'uploads') {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...', mask: true })
        try {
          const urls = []
          for (const f of res.tempFiles) {
            const ext = (f.tempFilePath.match(/\.\w+$/) || ['.jpg'])[0]
            const key = `${dir}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
            const url = await uploadFile(f.tempFilePath, key)
            urls.push(url)
          }
          wx.hideLoading()
          resolve(urls)
        } catch (e) {
          wx.hideLoading()
          reject(e)
        }
      },
      fail: reject
    })
  })
}

/** 是否已是当前桶的公网地址 */
function isOwnCosUrl(url) {
  const base = getBaseUrl()
  if (!url || !base) return false
  return String(url).indexOf(base) === 0
}

/** 外链图片（演示图等）需要迁移到 COS */
function isExternalImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (!/^https?:\/\//i.test(url)) return false
  return !isOwnCosUrl(url)
}

/**
 * 给当前桶的图片 URL 追加 COS 图片样式（默认 watermark）
 * 仅游客展示用，不改 content.json 里存的原图地址
 */
function applyImageStyle(url, styleName) {
  const name = styleName || conf.imageStyle || 'watermark'
  if (!url || typeof url !== 'string' || !name) return url
  if (!isOwnCosUrl(url)) return url

  const hashIdx = url.indexOf('#')
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : ''
  const noHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url
  const qIdx = noHash.indexOf('?')
  const query = qIdx >= 0 ? noHash.slice(qIdx) : ''
  let path = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash
  path = path.replace(/![^/?#]+$/, '')
  return `${path}/${name}${query}${hash}`
}

function downloadTempFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath)
        } else {
          reject(new Error(`下载失败 HTTP ${res.statusCode || ''}`))
        }
      },
      fail: (err) => reject(err)
    })
  })
}

function keyFromRemoteUrl(url, dir) {
  let name = 'img'
  const seed = url.match(/\/seed\/([^/?#]+)/i)
  const last = url.match(/\/([^/?#]+?)(?:\.\w+)?(?:\?|#|$)/)
  if (seed) name = seed[1]
  else if (last) name = last[1]
  name = String(name).replace(/[^\w.-]/g, '_').slice(0, 48) || 'img'
  const extMatch = url.match(/\.(jpe?g|png|gif|webp)(?:\?|#|$)/i)
  const ext = extMatch ? `.${extMatch[1].toLowerCase().replace('jpeg', 'jpg')}` : '.jpg'
  return `${dir.replace(/\/$/, '')}/${name}_${Date.now().toString(36).slice(-4)}${ext}`
}

/**
 * 下载外链图片并上传到 COS
 * @returns {Promise<string>} COS 公网 URL
 */
async function downloadAndUpload(url, dir = 'uploads') {
  if (!hasCosCredentials()) throw new Error('请先配置 COS 密钥')
  if (!isExternalImageUrl(url)) return url
  const tempPath = await downloadTempFile(url)
  const key = keyFromRemoteUrl(url, dir)
  return uploadFile(tempPath, key)
}

/**
 * 把完整 content 对象写回 COS 的 data/content.json
 */
function putContent(content) {
  return new Promise((resolve, reject) => {
    if (!hasCosCredentials()) {
      reject(new Error('请先配置 COS 密钥'))
      return
    }
    const c = getAdminConf()
    const cos = createCos()
    const body = JSON.stringify(content, null, 2)
    cos.putObject(
      {
        Bucket: c.Bucket,
        Region: c.Region,
        Key: getContentPath(),
        Body: body,
        ContentType: 'application/json; charset=utf-8',
        // 内容 JSON 必须实时可见，禁止 COS/CDN/客户端缓存旧版本
        CacheControl: 'no-cache, no-store, must-revalidate'
      },
      (err, data) => {
        if (err) reject(err)
        else resolve(data)
      }
    )
  })
}

/** 拉取线上 content.json；失败抛错 */
function fetchRemoteContent() {
  const url = contentUrl()
  if (!url) {
    return Promise.reject(new Error('未配置 baseUrl'))
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      header: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          resolve(data)
        } else {
          reject(new Error(`拉取内容失败 HTTP ${res.statusCode}`))
        }
      },
      fail: (err) => reject(err)
    })
  })
}

function errMessage(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  return err.message || err.error || err.errMsg || JSON.stringify(err)
}

function cosCall(cos, method, params) {
  return new Promise((resolve, reject) => {
    cos[method](params, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

/**
 * COS 连通性检测（可传表单覆盖，不必先保存）
 * @param {object} [override]
 * @returns {Promise<{ok:boolean, steps:Array<{id,name,ok,message}>}>}
 */
async function testConnection(override = {}) {
  const stored = getAdminConf()
  const c = {
    SecretId: (override.SecretId != null ? override.SecretId : stored.SecretId) || '',
    SecretKey: (override.SecretKey != null ? override.SecretKey : stored.SecretKey) || '',
    Bucket: (override.Bucket != null ? override.Bucket : stored.Bucket) || '',
    Region: (override.Region != null ? override.Region : stored.Region) || '',
    baseUrl: String(
      (override.baseUrl != null ? override.baseUrl : stored.baseUrl || conf.baseUrl) || ''
    ).replace(/\/$/, '')
  }

  const steps = []
  const push = (id, name, ok, message) => {
    steps.push({ id, name, ok, message })
  }

  // 1. 配置完整性
  const missing = []
  if (!c.Bucket) missing.push('Bucket')
  if (!c.Region) missing.push('Region')
  if (!c.SecretId) missing.push('SecretId')
  if (!c.SecretKey) missing.push('SecretKey')
  if (!c.baseUrl) missing.push('baseUrl')
  if (missing.length) {
    push('config', '配置完整性', false, `缺少：${missing.join('、')}`)
    return { ok: false, steps }
  }
  push('config', '配置完整性', true, `${c.Bucket} @ ${c.Region}`)

  // 2. 公网可读（合法域名 / 桶权限）
  const contentPath = getContentPath()
  const probeUrl = `${c.baseUrl}/${contentPath}?t=${Date.now()}`
  try {
    const httpRes = await new Promise((resolve, reject) => {
      wx.request({
        url: probeUrl,
        method: 'GET',
        success: resolve,
        fail: reject
      })
    })
    const code = httpRes.statusCode
    if (code >= 200 && code < 300) {
      push('publicRead', '公网可读', true, `已读到 ${contentPath}（HTTP ${code}）`)
    } else if (code === 404) {
      push(
        'publicRead',
        '公网可读',
        true,
        `域名可达，但尚无 ${contentPath}（HTTP 404，可稍后上传演示数据）`
      )
    } else if (code === 403) {
      push('publicRead', '公网可读', false, 'HTTP 403：桶可能不是公有读，或防盗链拦截')
    } else {
      push('publicRead', '公网可读', false, `HTTP ${code}：请检查 baseUrl 与桶权限`)
    }
  } catch (e) {
    push(
      'publicRead',
      '公网可读',
      false,
      `请求失败：${errMessage(e)}（检查合法域名 / 网络 / baseUrl）`
    )
  }

  // 3. 密钥鉴权（headBucket）
  let cos
  try {
    cos = new COS({
      SecretId: c.SecretId,
      SecretKey: c.SecretKey
    })
    await cosCall(cos, 'headBucket', { Bucket: c.Bucket, Region: c.Region })
    push('auth', '密钥鉴权', true, 'headBucket 成功，密钥与桶匹配')
  } catch (e) {
    push('auth', '密钥鉴权', false, errMessage(e))
    return { ok: steps.every((s) => s.ok), steps }
  }

  // 4. 写入权限（写探测文件后删除）
  const probeKey = `.wxtool_probe/ping_${Date.now()}.txt`
  try {
    await cosCall(cos, 'putObject', {
      Bucket: c.Bucket,
      Region: c.Region,
      Key: probeKey,
      Body: `ok ${Date.now()}`,
      ContentType: 'text/plain; charset=utf-8'
    })
    try {
      await cosCall(cos, 'deleteObject', {
        Bucket: c.Bucket,
        Region: c.Region,
        Key: probeKey
      })
      push('write', '写入权限', true, '探测文件已写入并清理')
    } catch (delErr) {
      push('write', '写入权限', true, `写入成功，但清理失败：${errMessage(delErr)}`)
    }
  } catch (e) {
    push('write', '写入权限', false, errMessage(e))
  }

  // 5. 游客端可见性：其他用户只认 config.js 的 baseUrl
  const guestBase = getGuestBaseUrl()
  if (!isGuestBaseUrlReady()) {
    push(
      'guest',
      '游客端可见性',
      false,
      `config.js 的 baseUrl 仍是占位值（${guestBase || '空'}），其他用户只会看到打包的演示数据。请改成真实域名并重新发布小程序`
    )
  } else if (guestBase !== c.baseUrl) {
    push(
      'guest',
      '游客端可见性',
      false,
      `config.js 的 baseUrl（${guestBase}）与当前配置（${c.baseUrl}）不一致，其他用户读的是前者`
    )
  } else {
    const env = getEnvVersion()
    const envTip =
      env === 'release'
        ? '当前是正式版，域名校验已生效'
        : '当前是开发/体验版，不校验合法域名；正式版还需在 mp 后台把该域名加入 request 与 downloadFile 合法域名，并发布新版本'
    push('guest', '游客端可见性', true, `config.js 与当前配置一致。${envTip}`)
  }

  return { ok: steps.every((s) => s.ok), steps }
}

module.exports = {
  STORAGE_KEY,
  PROFILES_KEY,
  listProfiles,
  saveProfile,
  removeProfile,
  setActiveProfile,
  getAdminConf,
  saveAdminConf,
  clearAdminConf,
  getBaseUrl,
  getGuestBaseUrl,
  isGuestBaseUrlReady,
  getEnvVersion,
  getContentPath,
  contentUrl,
  hasCosCredentials,
  uploadFile,
  chooseAndUpload,
  isOwnCosUrl,
  isExternalImageUrl,
  applyImageStyle,
  downloadAndUpload,
  putContent,
  fetchRemoteContent,
  publicUrl,
  testConnection
}
