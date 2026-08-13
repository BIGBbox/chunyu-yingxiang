#!/usr/bin/env node
/**
 * 本地 COS 连通性检测（Node.js）
 *
 * 用法：
 *   npm run cos:ping
 *   node tools/cos-ping.js
 *   node tools/cos-ping.js --config tools/cos.local.json
 *
 * 凭证来源（优先级从高到低）：
 *   1. 命令行 --Bucket / --Region / --SecretId / --SecretKey / --baseUrl
 *   2. 环境变量 COS_BUCKET / COS_REGION / COS_SECRET_ID / COS_SECRET_KEY / COS_BASE_URL
 *   3. 配置文件 tools/cos.local.json（勿提交仓库，见 cos.local.example.json）
 *   4. 项目 config.js 的 baseUrl / contentPath（仅域名，不含密钥）
 *
 * 小程序端检测仍在：管理端 → 查看 COS 状态 →「开始检测」
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

const ROOT = path.join(__dirname, '..')
const DEFAULT_CONFIG = path.join(__dirname, 'cos.local.json')
const EXAMPLE_CONFIG = path.join(__dirname, 'cos.local.example.json')

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return null
  }
}

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        out[key] = true
      } else {
        out[key] = next
        i++
      }
    } else {
      out._.push(a)
    }
  }
  return out
}

function resolveConf(args) {
  const filePath = args.config
    ? path.resolve(process.cwd(), args.config)
    : DEFAULT_CONFIG
  const fileConf = loadJson(filePath) || {}
  let projectConf = {}
  try {
    projectConf = require(path.join(ROOT, 'config.js')) || {}
  } catch (e) {
    /* ignore */
  }

  const c = {
    Bucket: args.Bucket || process.env.COS_BUCKET || fileConf.Bucket || '',
    Region: args.Region || process.env.COS_REGION || fileConf.Region || '',
    SecretId: args.SecretId || process.env.COS_SECRET_ID || fileConf.SecretId || '',
    SecretKey: args.SecretKey || process.env.COS_SECRET_KEY || fileConf.SecretKey || '',
    baseUrl: String(
      args.baseUrl ||
        process.env.COS_BASE_URL ||
        fileConf.baseUrl ||
        projectConf.baseUrl ||
        ''
    ).replace(/\/$/, ''),
    contentPath:
      args.contentPath ||
      process.env.COS_CONTENT_PATH ||
      fileConf.contentPath ||
      projectConf.contentPath ||
      'data/content.json',
    // 游客端唯一读取来源：仓库里 config.js 的静态域名
    guestBaseUrl: String(projectConf.baseUrl || '').replace(/\/$/, '')
  }

  return { c, filePath, fileExists: !!loadJson(filePath) }
}

function isGuestBaseUrlReady(base) {
  if (!base) return false
  return !/^https:\/\/demo-|你的桶|your-bucket|example/i.test(base)
}

function errMessage(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  return err.message || err.error || err.code || JSON.stringify(err)
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      const chunks = []
      res.on('data', (d) => chunks.push(d))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        })
      })
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
    req.on('error', reject)
  })
}

function cosCall(cos, method, params) {
  return new Promise((resolve, reject) => {
    cos[method](params, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

function printStep(step) {
  const mark = step.ok ? '✓' : '✗'
  console.log(`  ${mark} [${step.name}] ${step.message}`)
}

async function testConnection(c) {
  const steps = []
  const push = (id, name, ok, message) => {
    const step = { id, name, ok, message }
    steps.push(step)
    printStep(step)
  }

  console.log('\nCOS 连通性检测（本地 Node）\n')

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

  const probeUrl = `${c.baseUrl}/${c.contentPath}?t=${Date.now()}`
  try {
    const httpRes = await httpGet(probeUrl)
    const code = httpRes.statusCode
    if (code >= 200 && code < 300) {
      push('publicRead', '公网可读', true, `已读到 ${c.contentPath}（HTTP ${code}）`)
    } else if (code === 404) {
      push(
        'publicRead',
        '公网可读',
        true,
        `域名可达，但尚无 ${c.contentPath}（HTTP 404，可稍后上传演示数据）`
      )
    } else if (code === 403) {
      push('publicRead', '公网可读', false, 'HTTP 403：桶可能不是公有读，或防盗链拦截')
    } else {
      push('publicRead', '公网可读', false, `HTTP ${code}：请检查 baseUrl 与桶权限`)
    }
  } catch (e) {
    push('publicRead', '公网可读', false, `请求失败：${errMessage(e)}`)
  }

  let COS
  try {
    COS = require('cos-nodejs-sdk-v5')
  } catch (e) {
    push(
      'auth',
      '密钥鉴权',
      false,
      '未安装 cos-nodejs-sdk-v5，请先执行：npm install'
    )
    return { ok: false, steps }
  }

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

  const probeKey = `.wxtool_probe/ping_${Date.now()}.txt`
  try {
    await cosCall(cos, 'putObject', {
      Bucket: c.Bucket,
      Region: c.Region,
      Key: probeKey,
      Body: Buffer.from(`ok ${Date.now()}`, 'utf8'),
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

  if (!isGuestBaseUrlReady(c.guestBaseUrl)) {
    push(
      'guest',
      '游客端可见性',
      false,
      `config.js 的 baseUrl 仍是占位值（${c.guestBaseUrl || '空'}），其他用户只会看到打包的演示数据`
    )
  } else if (c.guestBaseUrl !== c.baseUrl) {
    push(
      'guest',
      '游客端可见性',
      false,
      `config.js 的 baseUrl（${c.guestBaseUrl}）与本次检测的域名（${c.baseUrl}）不一致，其他用户读的是前者`
    )
  } else {
    push('guest', '游客端可见性', true, 'config.js 与本次检测域名一致')
  }

  return { ok: steps.every((s) => s.ok), steps }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) {
    console.log(`用法: node tools/cos-ping.js [--config path]

可选参数:
  --config     凭证 JSON（默认 tools/cos.local.json）
  --Bucket --Region --SecretId --SecretKey --baseUrl

示例配置见: ${path.relative(process.cwd(), EXAMPLE_CONFIG)}
小程序内检测: 管理端 → 查看 COS 状态 →「开始检测」`)
    process.exit(0)
  }

  const { c, filePath, fileExists } = resolveConf(args)
  if (!fileExists && !process.env.COS_SECRET_ID && !args.SecretId) {
    console.log(`提示: 未找到 ${path.relative(process.cwd(), filePath)}`)
    console.log(`可复制 ${path.relative(process.cwd(), EXAMPLE_CONFIG)} 为 cos.local.json 后填写密钥\n`)
  }

  const result = await testConnection(c)
  console.log('')
  if (result.ok) {
    console.log('结果: 全部通过，COS 可正常读写')
    process.exit(0)
  }
  console.log('结果: 存在失败项，请按上方提示排查')
  process.exit(1)
}

main().catch((e) => {
  console.error('检测异常:', errMessage(e))
  process.exit(1)
})
