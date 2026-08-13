/**
 * 腾讯云 SCF（云函数）+ 函数 URL HTTP 触发
 * 作用：校验小程序管理员身份，并向管理员下发默认 COS 配置。
 *
 * 流程：小程序 wx.login() 拿 code → POST { code } 到函数 URL
 *      → 用 appid/appsecret 调微信 code2session 换 openid
 *      → openid 命中白名单则 isAdmin=true，并返回默认 COS 配置。
 *
 * 机密（appsecret / COS 密钥）放在同目录 config.js（勿提交，见 config.example.js），
 * 或用 SCF 环境变量 WX_APPID / WX_APPSECRET / ADMIN_OPENIDS 覆盖。
 * COS 可用 COS_BUCKET / COS_REGION / COS_SECRET_ID / COS_SECRET_KEY / COS_BASE_URL 覆盖。
 *
 * 部署请用「函数 URL」（API 网关触发器已停新建），见 README.md。
 */
const https = require('https')

let CONF = {}
try {
  CONF = require('./config') || {}
} catch (e) {
  CONF = {}
}

function getAppid() {
  return process.env.WX_APPID || CONF.appid || ''
}

function getAppsecret() {
  return process.env.WX_APPSECRET || CONF.appsecret || ''
}

/** 每次请求重新读环境变量，改完 ADMIN_OPENIDS 后等冷启动即可生效 */
function getAdminOpenids() {
  const fromEnv = String(process.env.ADMIN_OPENIDS || '')
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (fromEnv.length) return fromEnv
  return (CONF.adminOpenids || []).map((item) => String(item || '').trim()).filter(Boolean)
}

function getCos() {
  const envBucket = process.env.COS_BUCKET || ''
  const envRegion = process.env.COS_REGION || ''
  const envId = process.env.COS_SECRET_ID || ''
  const envKey = process.env.COS_SECRET_KEY || ''
  const envBase = String(process.env.COS_BASE_URL || '').replace(/\/$/, '')
  if (envBucket && envRegion && envId && envKey) {
    return {
      name: process.env.COS_NAME || '默认配置',
      Bucket: envBucket,
      Region: envRegion,
      SecretId: envId,
      SecretKey: envKey,
      baseUrl: envBase || `https://${envBucket}.cos.${envRegion}.myqcloud.com`
    }
  }
  const c = CONF.cos || null
  if (!c || !c.Bucket || !c.Region || !c.SecretId || !c.SecretKey) return null
  return {
    name: c.name || '默认配置',
    Bucket: c.Bucket,
    Region: c.Region,
    SecretId: c.SecretId,
    SecretKey: c.SecretKey,
    baseUrl: String(c.baseUrl || '').replace(/\/$/, '') || `https://${c.Bucket}.cos.${c.Region}.myqcloud.com`
  }
}

function code2session(appid, appsecret, code) {
  return new Promise((resolve, reject) => {
    const url =
      'https://api.weixin.qq.com/sns/jscode2session' +
      `?appid=${appid}&secret=${appsecret}&js_code=${code}&grant_type=authorization_code`
    https
      .get(url, (res) => {
        let raw = ''
        res.on('data', (d) => (raw += d))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw))
          } catch (e) {
            reject(new Error('code2session 返回解析失败'))
          }
        })
      })
      .on('error', reject)
  })
}

function parseBody(event) {
  if (!event) return {}
  let raw = event.body
  if (raw == null) return event.code ? { code: event.code } : {}
  if (event.isBase64Encoded) {
    try {
      raw = Buffer.from(raw, 'base64').toString('utf8')
    } catch (e) {
      /* ignore */
    }
  }
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch (e) {
    return {}
  }
}

function respond(obj) {
  return {
    isBase64Encoded: false,
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj)
  }
}

exports.main_handler = async (event) => {
  const body = parseBody(event)
  const code = body.code
  const appid = getAppid()
  const appsecret = getAppsecret()
  const adminOpenids = getAdminOpenids()
  const cos = getCos()

  if (!appid || !appsecret) {
    return respond({ isAdmin: false, error: '服务端未配置 appid/appsecret' })
  }
  if (!code) {
    return respond({ isAdmin: false, error: '缺少 code' })
  }

  try {
    const s = await code2session(appid, appsecret, code)
    if (!s.openid) {
      return respond({ isAdmin: false, error: s.errmsg || 'code2session 失败' })
    }
    const openid = String(s.openid).trim()
    const isAdmin = adminOpenids.indexOf(openid) >= 0
    console.log(
      JSON.stringify({
        tag: 'adminAuth',
        openid,
        whitelistCount: adminOpenids.length,
        isAdmin,
        hasCos: !!(cos && cos.SecretId && cos.SecretKey),
        source: process.env.ADMIN_OPENIDS ? 'env:ADMIN_OPENIDS' : 'config.adminOpenids'
      })
    )
    return respond({
      openid,
      isAdmin,
      cos: isAdmin && cos ? cos : null
    })
  } catch (e) {
    return respond({ isAdmin: false, error: String((e && e.message) || e) })
  }
}
