const conf = require('../config')
const cosUtil = require('./cos')
const localContent = require('../data/content.js')

const CACHE_KEY = 'content_cache_v1'

let _cache = null
let _loading = null

function flagOn(v) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function readStorageCache() {
  try {
    const raw = wx.getStorageSync(CACHE_KEY)
    return raw && raw.series ? raw : null
  } catch (e) {
    return null
  }
}

function writeStorageCache(data) {
  try {
    wx.setStorageSync(CACHE_KEY, data)
  } catch (e) {
    /* 容量不足等情况忽略，仅影响离线首屏 */
  }
}

function normalizePlatform(raw, legacyOn) {
  if (!raw || typeof raw !== 'object') return null
  const hasExplicit = raw.enabled != null
  return {
    ...raw,
    // 新数据用各平台自己的开关；旧数据没有该字段时沿用总开关
    enabled: hasExplicit ? flagOn(raw.enabled) : legacyOn
  }
}

function emptyCover() {
  return { type: 'image', url: '', poster: '' }
}

/** 封面固定 5 槽；空槽保留便于管理端编辑 */
function normalizeCovers(list) {
  const src = Array.isArray(list) ? list.slice(0, 5) : []
  const out = []
  for (let i = 0; i < 5; i++) {
    const item = src[i]
    if (!item || typeof item !== 'object') {
      out.push(emptyCover())
      continue
    }
    out.push({
      type: item.type === 'video' ? 'video' : 'image',
      url: item.url || '',
      poster: item.poster || ''
    })
  }
  return out
}

function normalizeStudio(raw) {
  const s = raw && typeof raw === 'object' ? raw : {}
  const tags = Array.isArray(s.tags)
    ? s.tags.map((t) => String(t || '').replace(/^#/, '').trim()).filter(Boolean)
    : []
  const lat = Number(s.latitude)
  const lng = Number(s.longitude)
  return {
    name: s.name || '椿屿影像',
    intro: s.intro || '',
    tags,
    phone: s.phone ? String(s.phone).trim() : '',
    latitude: Number.isFinite(lat) ? lat : 0,
    longitude: Number.isFinite(lng) ? lng : 0,
    address: s.address || '',
    oaLink: s.oaLink ? String(s.oaLink).trim() : '',
    avatar: s.avatar ? String(s.avatar).trim() : '',
    wxacode: s.wxacode ? String(s.wxacode).trim() : ''
  }
}

function normalizeFeeds(list) {
  return (Array.isArray(list) ? list : [])
    .map((f, i) => {
      if (!f || typeof f !== 'object') return null
      return {
        id: f.id || `feed_${i}`,
        text: f.text || '',
        images: Array.isArray(f.images) ? f.images.filter(Boolean).slice(0, 9) : [],
        sort: f.sort != null ? Number(f.sort) || 0 : i + 1
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
}

function normalizeHome(raw) {
  const h = raw && typeof raw === 'object' ? raw : {}
  return {
    covers: normalizeCovers(h.covers),
    studio: normalizeStudio(h.studio),
    feeds: normalizeFeeds(h.feeds)
  }
}

function normalize(raw) {
  const data = raw || {}
  const storeRaw = data.store || {}
  const socialRaw = data.social || {}
  const legacySocialOn = flagOn(socialRaw.enabled)
  const xhs = normalizePlatform(socialRaw.xhs, legacySocialOn)
  const douyin = normalizePlatform(socialRaw.douyin, legacySocialOn)
  return {
    updatedAt: data.updatedAt || '',
    home: normalizeHome(data.home),
    series: (data.series || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)),
    styles: (data.styles || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)),
    store: {
      city: '景德镇门店',
      title: '景德镇门店信息',
      address: '',
      guidance: [],
      environment: [],
      ...storeRaw,
      // 默认关闭：未显式 true 则不展示
      enabled: flagOn(storeRaw.enabled)
    },
    social: {
      xhs,
      douyin,
      // 总开关由各平台推导，兼容旧读取逻辑
      enabled: !!(xhs && xhs.enabled) || !!(douyin && douyin.enabled)
    },
    settings: {
      // 游客端是否用 COS 样式 watermark 展示图片；默认关闭
      watermarkEnabled: !!(data.settings && data.settings.watermarkEnabled),
      // 右上角转发/朋友圈；缺省或未写时默认开启
      shareEnabled:
        !data.settings || data.settings.shareEnabled == null
          ? true
          : flagOn(data.settings.shareEnabled),
      // 动态评论；未显式 true 则关闭
      commentEnabled: !!(data.settings && flagOn(data.settings.commentEnabled))
    }
  }
}

function loadLocal() {
  return normalize(localContent)
}

/**
 * 加载内容：优先 COS，失败或未配置则本地
 * @param {boolean} force 强制刷新
 */
function loadContent(force = false) {
  if (_cache && !force) return Promise.resolve(_cache)
  if (_loading && !force) return _loading

  _loading = (async () => {
    const base = cosUtil.getBaseUrl() || (conf.baseUrl || '').replace(/\/$/, '')
    if (!base) {
      _cache = readStorageCache() || loadLocal()
      return _cache
    }
    try {
      const remote = await cosUtil.fetchRemoteContent()
      _cache = normalize(remote)
      writeStorageCache(_cache)
      try {
        getApp().globalData.content = _cache
      } catch (e) {
        /* ignore */
      }
      return _cache
    } catch (e) {
      console.warn('[content] remote fail, use cache/local', e)
      // 优先用上次成功拉取的线上数据，避免退回打包时的演示数据
      _cache = readStorageCache() || loadLocal()
      return _cache
    } finally {
      _loading = null
    }
  })()

  return _loading
}

/**
 * 静默刷新：拉到新数据才回调，用于小程序回到前台时更新界面
 * @param {Function} [onUpdated] 内容变化时回调
 */
function refreshInBackground(onUpdated) {
  const before = _cache ? _cache.updatedAt : ''
  return loadContent(true)
    .then((data) => {
      if (typeof onUpdated === 'function' && data && data.updatedAt !== before) {
        onUpdated(data)
      }
      return data
    })
    .catch(() => null)
}

function getCache() {
  return _cache
}

function setCache(data) {
  _cache = normalize(data)
  return _cache
}

function mapImageUrl(url) {
  return cosUtil.applyImageStyle(url)
}

function mapUrlList(list) {
  return (list || []).map((u) => mapImageUrl(u))
}

/** 游客展示：开启水印时给 COS 原图 URL 追加样式名 watermark（视频封面 poster 同样处理） */
function forDisplay(data) {
  if (!data || !data.settings || !data.settings.watermarkEnabled) return data
  const next = clone(data)
  ;(next.series || []).forEach((s) => {
    if (s.cover) s.cover = mapImageUrl(s.cover)
  })
  ;(next.styles || []).forEach((style) => {
    if (style.cover) style.cover = mapImageUrl(style.cover)
    if (style.avatar) style.avatar = mapImageUrl(style.avatar)
    if (style.images) style.images = mapUrlList(style.images)
    if (style.gallery) style.gallery = mapUrlList(style.gallery)
  })
  if (next.home) {
    if (next.home.covers) {
      next.home.covers = next.home.covers.map((c) => {
        if (!c) return c
        if (c.type === 'video') {
          return { ...c, poster: c.poster ? mapImageUrl(c.poster) : '' }
        }
        return { ...c, url: c.url ? mapImageUrl(c.url) : '' }
      })
    }
    if (next.home.feeds) {
      next.home.feeds = next.home.feeds.map((f) => ({
        ...f,
        images: mapUrlList(f.images)
      }))
    }
  }
  if (next.store) {
    if (next.store.guidance) next.store.guidance = mapUrlList(next.store.guidance)
    if (next.store.environment) next.store.environment = mapUrlList(next.store.environment)
  }
  if (next.social) {
    ;['xhs', 'douyin'].forEach((key) => {
      const item = next.social[key]
      if (!item) return
      if (item.qrcode) item.qrcode = mapImageUrl(item.qrcode)
      if (item.avatar) item.avatar = mapImageUrl(item.avatar)
      if (item.banner) item.banner = mapImageUrl(item.banner)
    })
  }
  return next
}

/** 仅作品列表使用水印：只处理列表封面，不影响其他页面。 */
function forStyleListDisplay(data) {
  if (!data || !data.settings || !data.settings.watermarkEnabled) return data
  const next = clone(data)
  next.styles = (next.styles || []).map((style) => ({
    ...style,
    cover: style.cover ? mapImageUrl(style.cover) : ''
  }))
  return next
}

async function getHome() {
  const data = await loadContent()
  const home = data.home || normalizeHome({})
  const covers = (home.covers || []).filter((c) => c && c.url)
  const xhs = data.social && data.social.xhs && data.social.xhs.enabled ? data.social.xhs : null
  const douyin = data.social && data.social.douyin && data.social.douyin.enabled ? data.social.douyin : null
  const showXhs = !!xhs
  const showDouyin = !!douyin
  const showSocial = showXhs || showDouyin
  const showStore = !!(data.store && data.store.enabled)
  return {
    covers,
    studio: home.studio || normalizeStudio({}),
    feeds: home.feeds || [],
    seriesList: (data.series || []).filter((s) => !s.hidden),
    social: { enabled: showSocial, xhs, douyin },
    showSocial,
    showXhs,
    showDouyin,
    showStore,
    store: data.store,
    styleCount: data.styles.length,
    commentEnabled: !!(data.settings && data.settings.commentEnabled)
  }
}

async function getStylesBySeries(seriesId, keyword) {
  const data = forStyleListDisplay(await loadContent())
  const series = data.series.find((s) => s.id === seriesId) || null
  let styles = data.styles.filter((s) => s.seriesId === seriesId)
  if (keyword && String(keyword).trim()) {
    const kw = String(keyword).trim()
    styles = styles.filter((s) => (s.name || '').includes(kw))
  }
  return {
    series,
    styles,
    styleCount: data.styles.length
  }
}

/** 客片 id 稳定哈希，同一条客片始终同一底数 */
function hashId(id) {
  let h = 2166136261
  const s = String(id || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 把 YYYY-MM-DD 当作北京时间 0 点，转成时间戳（所有人同一结果） */
function beijingMidnight(ymd) {
  const p = String(ymd || '')
    .split(/[-/]/)
    .map((n) => parseInt(n, 10))
  if (p.length < 3 || !p[0] || !p[1] || !p[2]) return 0
  // 北京 0 点 = UTC 前一天 16:00
  return Date.UTC(p[0], p[1] - 1, p[2], 0, 0, 0) - 8 * 3600 * 1000
}

function fakeViewConf() {
  const fv = conf.fakeViews || {}
  let min = Number(fv.baseMin)
  let max = Number(fv.baseMax)
  if (!Number.isFinite(min)) min = 18
  if (!Number.isFinite(max)) max = 89
  min = Math.max(0, Math.floor(min))
  max = Math.max(0, Math.floor(max))
  if (min > max) {
    const t = min
    min = max
    max = t
  }
  return {
    launchDate: fv.launchDate || conf.launchDate || '2026-08-12',
    baseMin: min,
    baseMax: max
  }
}

/**
 * 游客端观看人数：只由「客片 id + 北京时间 + 配置底数」决定。
 * 任意用户在同一时刻打开，数字一定相同；不写本机、不写 COS。
 * 底数在 config.fakeViews.baseMin～baseMax 之间；从上线日起每天 +1～2，白天每 2 小时再 +1。
 */
function fakeViewCount(id) {
  const fv = fakeViewConf()
  const h = hashId(id)
  const span = fv.baseMax - fv.baseMin + 1
  const base = fv.baseMin + (span > 0 ? h % span : 0)
  const start = beijingMidnight(fv.launchDate)
  if (!start) return base
  const now = Date.now()
  if (now <= start) return base
  const elapsed = now - start
  const days = Math.floor(elapsed / 86400000)
  const perDay = 1 + (h % 2)
  const bjHour = new Date(now + 8 * 3600 * 1000).getUTCHours()
  const todayBump = bjHour < 8 ? 0 : Math.min(7, Math.floor((Math.min(bjHour, 22) - 8) / 2))
  return base + days * perDay + todayBump
}

async function getStyleDetail(id) {
  const data = await loadContent()
  const style = data.styles.find((s) => s.id === id)
  if (!style) throw new Error('客片不存在')
  const view = clone(style)
  view.viewCount = fakeViewCount(style.id)
  return view
}

async function search(keyword) {
  const data = await loadContent()
  if (!keyword || !String(keyword).trim()) return { results: [] }
  const kw = String(keyword).trim()
  const seriesMap = {}
  data.series.forEach((s) => {
    seriesMap[s.id] = s
  })
  const results = []
  data.styles.forEach((style) => {
    const series = style.seriesId ? seriesMap[style.seriesId] : null
    // 未归类客片不在游客端搜索中展示
    if (!style.seriesId || !series || series.hidden) return
    if ((style.name || '').includes(kw) || (series.name || '').includes(kw)) {
      results.push({
        id: style.id,
        name: style.name,
        cover: style.cover,
        seriesId: style.seriesId,
        seriesName: series ? series.name : ''
      })
    }
  })
  return { results }
}

async function getStore(opts) {
  const data = await loadContent()
  return clone(data.store)
}

async function getAll() {
  return clone(await loadContent())
}

/** 管理员保存整包内容到 COS */
async function saveAll(content) {
  const next = normalize(content)
  next.updatedAt = formatNow()
  await cosUtil.putContent(next)
  _cache = next
  writeStorageCache(next)
  return next
}

/**
 * 把 content 里所有外链图片下载并上传到 COS，回写 URL
 * @param {object} content
 * @param {Function} [onProgress] (done, total, url) => void
 */
async function migrateExternalImages(content, onProgress) {
  if (!cosUtil.hasCosCredentials()) {
    throw new Error('请先配置 COS 密钥')
  }
  const data = clone(content)
  const urlCache = {}
  const jobs = []
  collectMigrateJobs(data, jobs)
  // 去重后计数
  const unique = []
  const seen = {}
  jobs.forEach((u) => {
    if (!seen[u]) {
      seen[u] = true
      unique.push(u)
    }
  })
  const total = unique.length
  let done = 0

  async function replaceOne(url, dir) {
    if (!cosUtil.isExternalImageUrl(url)) return url
    if (urlCache[url]) return urlCache[url]
    const next = await cosUtil.downloadAndUpload(url, dir)
    urlCache[url] = next
    done += 1
    if (typeof onProgress === 'function') onProgress(done, total, url)
    return next
  }

  if (data.home) {
    if (Array.isArray(data.home.covers)) {
      for (const cover of data.home.covers) {
        if (!cover) continue
        if (cover.type === 'video') {
          if (cover.poster) cover.poster = await replaceOne(cover.poster, 'home/covers')
          // 视频外链一般无法可靠下载，仅迁移封面图
        } else if (cover.url) {
          cover.url = await replaceOne(cover.url, 'home/covers')
        }
      }
    }
    if (Array.isArray(data.home.feeds)) {
      for (const feed of data.home.feeds) {
        if (!feed || !Array.isArray(feed.images)) continue
        for (let i = 0; i < feed.images.length; i++) {
          feed.images[i] = await replaceOne(feed.images[i], 'home/feeds')
        }
      }
    }
    if (data.home.studio && data.home.studio.avatar) {
      data.home.studio.avatar = await replaceOne(data.home.studio.avatar, 'home/avatar')
    }
    if (data.home.studio && data.home.studio.wxacode) {
      data.home.studio.wxacode = await replaceOne(data.home.studio.wxacode, 'home/wxacode')
    }
  }

  for (const series of data.series || []) {
    if (series.cover) series.cover = await replaceOne(series.cover, 'series/cover')
  }

  for (const style of data.styles || []) {
    if (style.cover) style.cover = await replaceOne(style.cover, 'styles/images')
    if (style.avatar) style.avatar = await replaceOne(style.avatar, 'styles/avatar')
    if (Array.isArray(style.images)) {
      for (let i = 0; i < style.images.length; i++) {
        style.images[i] = await replaceOne(style.images[i], 'styles/images')
      }
    }
    if (Array.isArray(style.gallery)) {
      for (let i = 0; i < style.gallery.length; i++) {
        style.gallery[i] = await replaceOne(style.gallery[i], 'styles/gallery')
      }
    }
  }

  if (data.store) {
    if (Array.isArray(data.store.guidance)) {
      for (let i = 0; i < data.store.guidance.length; i++) {
        data.store.guidance[i] = await replaceOne(data.store.guidance[i], 'store/guide')
      }
    }
    if (Array.isArray(data.store.environment)) {
      for (let i = 0; i < data.store.environment.length; i++) {
        data.store.environment[i] = await replaceOne(data.store.environment[i], 'store/env')
      }
    }
  }

  if (data.social) {
    for (const key of ['xhs', 'douyin']) {
      const item = data.social[key]
      if (!item) continue
      if (item.qrcode) item.qrcode = await replaceOne(item.qrcode, 'social/qrcode')
      if (item.avatar) item.avatar = await replaceOne(item.avatar, 'social/avatar')
      if (item.banner) item.banner = await replaceOne(item.banner, 'social/banner')
    }
  }

  return {
    content: data,
    migrated: Object.keys(urlCache).length,
    skipped: total - Object.keys(urlCache).length
  }
}

function collectMigrateJobs(data, out) {
  const push = (url) => {
    if (cosUtil.isExternalImageUrl(url)) out.push(url)
  }
  if (data.home) {
    ;(data.home.covers || []).forEach((c) => {
      if (!c) return
      if (c.type === 'video') push(c.poster)
      else push(c.url)
    })
    ;(data.home.feeds || []).forEach((f) => {
      ;(f.images || []).forEach(push)
    })
    if (data.home.studio) {
      push(data.home.studio.avatar)
      push(data.home.studio.wxacode)
    }
  }
  ;(data.series || []).forEach((s) => push(s.cover))
  ;(data.styles || []).forEach((style) => {
    push(style.cover)
    push(style.avatar)
    ;(style.images || []).forEach(push)
    ;(style.gallery || []).forEach(push)
  })
  if (data.store) {
    ;(data.store.guidance || []).forEach(push)
    ;(data.store.environment || []).forEach(push)
  }
  if (data.social) {
    ;['xhs', 'douyin'].forEach((key) => {
      const item = data.social[key]
      if (!item) return
      push(item.qrcode)
      push(item.avatar)
      push(item.banner)
    })
  }
}

function formatNow() {
  const d = new Date()
  const p = (n) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

module.exports = {
  CACHE_KEY,
  loadContent,
  refreshInBackground,
  getCache,
  setCache,
  getHome,
  getStylesBySeries,
  getStyleDetail,
  search,
  getStore,
  getAll,
  saveAll,
  migrateExternalImages,
  flagOn,
  genId,
  formatNow
}
