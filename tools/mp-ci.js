/**
 * 微信小程序 CI：上传代码，可选提交审核。
 *
 * 用法：
 *   node tools/mp-ci.js upload [--version 1.0.3] [--desc "说明"] [--robot 1]
 *   node tools/mp-ci.js submit [--desc "审核说明"]
 *   node tools/mp-ci.js all    # 先上传再提审（需配置 APPSECRET）
 *
 * 环境变量 / 参数：
 *   WX_APPID          小程序 appid（默认同 project.config.json）
 *   WX_PRIVATE_KEY    代码上传私钥全文（CI 用；本地可用私钥文件）
 *   WX_PRIVATE_KEY_PATH 私钥文件路径（默认 ./private.WX_APPID.key）
 *   WX_APPSECRET      提审用（仅 submit/all；放 GitHub Secrets，勿提交）
 *   MP_VERSION / MP_DESC / MP_ROBOT
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const ROOT = path.join(__dirname, '..')
const projectConfig = require(path.join(ROOT, 'project.config.json'))

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out[key] = next
        i++
      } else {
        out[key] = true
      }
    } else {
      out._.push(a)
    }
  }
  return out
}

function httpsJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = body == null ? null : JSON.stringify(body)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: data
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data)
            }
          : {}
      },
      (res) => {
        let raw = ''
        res.on('data', (d) => (raw += d))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw))
          } catch (e) {
            reject(new Error(`响应非 JSON: ${raw.slice(0, 200)}`))
          }
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function resolvePrivateKey(appid) {
  const fromEnv = process.env.WX_PRIVATE_KEY || ''
  if (fromEnv.trim()) {
    const file = path.join(ROOT, `.ci-private.${appid}.key`)
    fs.writeFileSync(file, fromEnv.replace(/\\n/g, '\n'), 'utf8')
    return file
  }
  const custom = process.env.WX_PRIVATE_KEY_PATH
  if (custom && fs.existsSync(custom)) return path.resolve(custom)
  const def = path.join(ROOT, `private.${appid}.key`)
  if (fs.existsSync(def)) return def
  throw new Error(
    `未找到上传私钥。请设置环境变量 WX_PRIVATE_KEY，或放置文件 private.${appid}.key`
  )
}

function defaultVersion() {
  try {
    return require(path.join(ROOT, 'package.json')).version || '0.0.0'
  } catch (e) {
    return '0.0.0'
  }
}

async function createProject(appid) {
  const ci = require('miniprogram-ci')
  const privateKeyPath = resolvePrivateKey(appid)
  return new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath: ROOT,
    privateKeyPath,
    ignores: [
      'node_modules/**/*',
      'tools/**/*',
      'scf/**/*',
      'docs/**/*',
      '.git/**/*',
      '.github/**/*',
      '.cursor/**/*',
      '.ci-private.*.key',
      'private.*.key',
      '**/*.md'
    ]
  })
}

async function doUpload(opts) {
  const ci = require('miniprogram-ci')
  const appid = opts.appid || process.env.WX_APPID || projectConfig.appid
  if (!appid) throw new Error('缺少 appid')
  const version = String(opts.version || process.env.MP_VERSION || defaultVersion())
  const desc = String(
    opts.desc || process.env.MP_DESC || `ci upload ${version} @ ${new Date().toISOString()}`
  )
  const robot = Number(opts.robot || process.env.MP_ROBOT || 1) || 1

  console.log(`[mp-ci] upload appid=${appid} version=${version} robot=${robot}`)
  const project = await createProject(appid)
  const result = await ci.upload({
    project,
    version,
    desc,
    robot,
    setting: {
      useProjectConfig: true
    },
    onProgressUpdate: (p) => {
      if (p && p.message) console.log('[mp-ci]', p.message)
    }
  })
  console.log('[mp-ci] upload ok', JSON.stringify(result || {}))
  return { appid, version, desc }
}

async function getAccessToken(appid, secret) {
  const url =
    'https://api.weixin.qq.com/cgi-bin/token' +
    `?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`
  const data = await httpsJson('GET', url)
  if (!data.access_token) {
    throw new Error(data.errmsg || `获取 access_token 失败: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

async function getCategoryList(token) {
  const data = await httpsJson(
    'GET',
    `https://api.weixin.qq.com/cgi-bin/wxopen/getcategory?access_token=${token}`
  )
  if (data.errcode && data.errcode !== 0) {
    // 兼容另一接口
    const data2 = await httpsJson(
      'GET',
      `https://api.weixin.qq.com/wxa/get_category?access_token=${token}`
    )
    if (data2.errcode && data2.errcode !== 0) {
      throw new Error(data.errmsg || data2.errmsg || '获取类目失败')
    }
    return data2.category_list || data2.categories || []
  }
  return data.categories || data.category_list || []
}

function buildItemList(categories) {
  const list = []
  const rows = Array.isArray(categories) ? categories : []
  for (const c of rows) {
    const first = c.first_class || c.first_name || c.first
    const second = c.second_class || c.second_name || c.second
    const firstId = c.first_id != null ? c.first_id : c.first
    const secondId = c.second_id != null ? c.second_id : c.second
    if (first && second) {
      list.push({
        first_class: String(first),
        second_class: String(second),
        first_id: Number(firstId) || firstId,
        second_id: Number(secondId) || secondId
      })
    } else if (c.audit_free != null || c.first_id != null) {
      list.push({
        first_class: String(c.first_class || ''),
        second_class: String(c.second_class || ''),
        first_id: c.first_id,
        second_id: c.second_id
      })
    }
    if (list.length >= 5) break
  }
  return list.filter((i) => i.first_class && i.second_class)
}

async function doSubmit(opts) {
  const appid = opts.appid || process.env.WX_APPID || projectConfig.appid
  const secret = process.env.WX_APPSECRET || ''
  if (!appid) throw new Error('缺少 appid')
  if (!secret) {
    throw new Error('提审需要环境变量 WX_APPSECRET（勿写入仓库，用 GitHub Secrets）')
  }
  const versionDesc = String(
    opts.desc || process.env.MP_DESC || `ci submit @ ${new Date().toISOString()}`
  )

  console.log(`[mp-ci] submit audit appid=${appid}`)
  const token = await getAccessToken(appid, secret)
  const categories = await getCategoryList(token)
  const item_list = buildItemList(categories)
  if (!item_list.length) {
    throw new Error(
      '未拿到可用服务类目。请先在微信公众平台完善小程序类目，再重试提审。'
    )
  }

  const payload = {
    item_list,
    version_desc: versionDesc
  }
  const data = await httpsJson(
    'POST',
    `https://api.weixin.qq.com/wxa/submit_audit?access_token=${token}`,
    payload
  )
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`提审失败 [${data.errcode}] ${data.errmsg || JSON.stringify(data)}`)
  }
  console.log('[mp-ci] submit ok', JSON.stringify(data))
  return data
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] || 'upload'
  if (cmd === 'upload') {
    await doUpload(args)
    return
  }
  if (cmd === 'submit') {
    await doSubmit(args)
    return
  }
  if (cmd === 'all') {
    await doUpload(args)
    await doSubmit(args)
    return
  }
  console.error('用法: node tools/mp-ci.js <upload|submit|all> [--version x] [--desc t] [--robot n]')
  process.exit(1)
}

main().catch((e) => {
  console.error('[mp-ci] failed:', (e && e.message) || e)
  process.exit(1)
})
