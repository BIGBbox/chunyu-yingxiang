/**
 * 升降 package.json 版本号（semver）。
 * 用法: node tools/mp-bump.js [patch|minor|major|1.2.3]
 * 输出新版本号到 stdout；也写到 GITHUB_OUTPUT（若在 Actions 中）。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const PKG = path.join(ROOT, 'package.json')
const LOCK = path.join(ROOT, 'package-lock.json')

function parseSemver(v) {
  const m = String(v || '')
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) throw new Error(`非法版本号: ${v}`)
  return { major: +m[1], minor: +m[2], patch: +m[3], raw: `${+m[1]}.${+m[2]}.${+m[3]}` }
}

function bump(kind, current) {
  const s = parseSemver(current)
  const k = String(kind || 'patch').toLowerCase()
  if (/^\d+\.\d+\.\d+/.test(k)) return parseSemver(k).raw
  if (k === 'major') return `${s.major + 1}.0.0`
  if (k === 'minor') return `${s.major}.${s.minor + 1}.0`
  if (k === 'patch') return `${s.major}.${s.minor}.${s.patch + 1}`
  throw new Error(`未知 bump 类型: ${kind}（用 patch|minor|major|x.y.z）`)
}

function writePkgVersion(file, version) {
  if (!fs.existsSync(file)) return
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  json.version = version
  if (json.packages && json.packages['']) json.packages[''].version = version
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
}

function main() {
  const kind = process.argv[2] || 'patch'
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'))
  const next = bump(kind, pkg.version)
  writePkgVersion(PKG, next)
  writePkgVersion(LOCK, next)
  process.stdout.write(next)
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\n`)
  }
}

main()
