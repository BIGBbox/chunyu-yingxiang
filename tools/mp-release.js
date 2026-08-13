/**
 * 本地一键发版：自动升版本 → 提交 →（可选）触发 GitHub Actions 上传微信。
 *
 * 用法：
 *   npm run mp:release              # patch + 提交，并尝试 gh workflow run
 *   npm run mp:release -- minor
 *   npm run mp:release -- patch --no-dispatch   # 只改版本并提交，不触发 CI
 *   npm run mp:release -- 1.2.0 --submit        # 指定版本，并提审
 *
 * 需要已安装 GitHub CLI（gh）并登录，才会自动触发 Actions；否则会打印手动步骤。
 */
const { execSync, spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...opts
  })
}

function shOut(cmd) {
  return String(execSync(cmd, { cwd: ROOT, encoding: 'utf8' })).trim()
}

function hasGh() {
  try {
    shOut('gh --version')
    return true
  } catch (e) {
    return false
  }
}

function parseArgs(argv) {
  const out = { bump: 'patch', dispatch: true, submit: false }
  for (const a of argv) {
    if (a === '--no-dispatch') out.dispatch = false
    else if (a === '--dispatch') out.dispatch = true
    else if (a === '--submit') out.submit = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (/^(patch|minor|major)$/i.test(a) || /^\d+\.\d+\.\d+/.test(a)) out.bump = a
  }
  return out
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`用法: node tools/mp-release.js [patch|minor|major|x.y.z] [--submit] [--no-dispatch]`)
    process.exit(0)
  }

  const status = shOut('git status --porcelain')
  if (status) {
    console.error('工作区有未提交改动，请先提交或暂存后再发版：\n' + status)
    process.exit(1)
  }

  const branch = shOut('git rev-parse --abbrev-ref HEAD')
  const oldVer = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
  const newVer = shOut(`node tools/mp-bump.js ${args.bump}`)
  console.log(`[mp-release] ${oldVer} → ${newVer} (branch ${branch})`)

  sh('git add package.json package-lock.json')
  sh(`git commit -m "chore: release ${newVer}"`)

  if (!args.dispatch) {
    console.log(`[mp-release] 已提交。未触发 CI。可手动: Actions → 微信小程序 CI → Run workflow`)
    console.log(`[mp-release] 或: gh workflow run "微信小程序 CI" -f bump=none -f version=${newVer}`)
    return
  }

  // 先推送版本提交，再触发 workflow（基于最新 commit）
  try {
    sh(`git push origin ${branch}`)
  } catch (e) {
    console.error('[mp-release] git push 失败，请先推送后再手动触发 Actions')
    process.exit(1)
  }

  if (!hasGh()) {
    console.log('[mp-release] 未检测到 gh CLI。请打开 GitHub → Actions →「微信小程序 CI」→ Run workflow')
    console.log(`  version=${newVer}  bump=none  submit_audit=${args.submit}`)
    return
  }

  const fields = [
    '-f',
    'bump=none',
    '-f',
    `version=${newVer}`,
    '-f',
    `desc=release ${newVer}`,
    '-f',
    `submit_audit=${args.submit}`
  ]
  console.log('[mp-release] 触发 GitHub Actions…')
  const r = spawnSync(
    'gh',
    ['workflow', 'run', '微信小程序 CI', '--ref', branch, ...fields],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' }
  )
  if (r.status !== 0) {
    // 兼容用文件名触发
    const r2 = spawnSync(
      'gh',
      ['workflow', 'run', 'mp-ci.yml', '--ref', branch, ...fields],
      { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' }
    )
    if (r2.status !== 0) {
      console.error('[mp-release] gh workflow run 失败，请到网页手动 Run workflow')
      process.exit(1)
    }
  }
  console.log(`[mp-release] 已触发上传 ${newVer}。查看: gh run list --workflow=mp-ci.yml`)
}

main()
