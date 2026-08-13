# 椿屿影像 · 微信小程序 CI

用 `miniprogram-ci` **上传代码**；可选再 **提交审核**。  
**不必手打 tag**——推荐下面两种方式。

## 推荐触发方式（二选一）

### 方式 A：网页一键（最省事）

1. GitHub → **Actions** → **微信小程序 CI** → **Run workflow**
2. `bump` 选 `patch`（默认，自动 1.0.3 → 1.0.4）
3. 需要提审时勾选 `submit_audit`
4. Run

工作流会改 `package.json` 版本、推回仓库，再上传微信。

### 方式 B：本地一条命令

```bash
# 工作区先保持干净
npm run mp:release           # patch 升版 + 提交推送 + 触发 Actions
npm run mp:release -- minor  # 次版本
npm run mp:release -- --submit   # 上传并提审
```

需安装并登录 [GitHub CLI](https://cli.github.com/)（`gh auth login`）。没有 `gh` 时仍会升版推送，然后去网页点 Run workflow。

---

## 一、微信后台准备

1. 登录 [微信公众平台](https://mp.weixin.qq.com) → **开发管理** → **开发设置** → **小程序代码上传**
2. 生成并下载私钥（形如 `private.wx…….key`）
3. **关闭 IP 白名单**（或把 GitHub Actions 出口 IP 加白；不关白名单时 CI 常会鉴权失败）
4. 确认小程序已配置好 **服务类目**（提审时要用）

本地调试可把私钥放在项目根目录：`private.你的APPID.key`（已 gitignore，勿提交）。

## 二、GitHub Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Name | 说明 |
|------|------|
| `WX_PRIVATE_KEY` | 上传私钥文件**全文**（含 `-----BEGIN…`） |
| `WX_APPID` | 可选；不填则用 `project.config.json` 的 appid |
| `WX_APPSECRET` | **仅提审需要**；公众平台 → 开发设置 → AppSecret |

## 三、其它触发（可选）

仍支持推送 `v*` tag（兼容旧习惯），但不推荐日常使用：

```bash
git tag v1.0.4
git push origin v1.0.4
```

## 四、本地仅上传（不走 GitHub）

```bash
npm install
# 私钥放 private.<appid>.key 或 export WX_PRIVATE_KEY="$(cat private.xxx.key)"
npm run mp:upload -- --version 1.0.4 --desc "修复文案"
npm run mp:submit -- --desc "本版本更新说明"   # 需 WX_APPSECRET
npm run mp:ci      # 上传 + 提审
```

## 五、说明

- **上传**：生成/更新微信后台的开发版本，可用体验版查看  
- **提审**：调用 `wxa/submit_audit`；过审后仍建议在后台确认再点「发布」  
- AppSecret / 私钥等同发版权限，只放 Secrets  
- 与 COS / SCF 无关；改的是小程序包发布链路  
