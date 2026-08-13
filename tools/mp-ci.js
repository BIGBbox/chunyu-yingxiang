/**
 * 微信小程序 CI：上传代码到开发/体验版。
 *
 * 用法：
 *   node tools/mp-ci.js upload [--version 1.0.3] [--desc "说明"] [--robot 1]
 *
 * 环境变量：
 *   WX_APPID          小程序 appid（默认同 project.config.json）
 *   WX_PRIVATE_KEY    代码上传私钥全文（CI 用；本地可用私钥文件）
 *   WX_PRIVATE_KEY_PATH 私钥文件路径（默认 ./private.WX_APPID.key）
 *   MP_VERSION / MP_DESC / MP_ROBOT
 */
const fs = require('fs')
const path = require('path')

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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] || 'upload'
  if (cmd === 'upload') {
    await doUpload(args)
    return
  }
  console.error('用法: node tools/mp-ci.js upload [--version x] [--desc t] [--robot n]')
  process.exit(1)
}

main().catch((e) => {
  console.error('[mp-ci] failed:', (e && e.message) || e)
  process.exit(1)
})
