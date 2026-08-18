# CLAUDE.md · 椿屿影像

微信小程序：客片浏览 + 套餐详情 + 门店信息。  
**存储方案：腾讯云 COS**（按量计费），不依赖微信云开发付费套餐。

## 架构

- **游客**：`GET {baseUrl}/data/content.json` + 图片公网 URL
- **管理**：本机填写 COS 密钥 → SDK 上传图片 / 写回 JSON（密钥不进仓库）

详细建桶与对接：[docs/COS上手.md](docs/COS上手.md)  
项目概览：[README.md](README.md)

## 关键路径

| 路径 | 作用 |
|------|------|
| `config.js` | 静态 `baseUrl`、`contentPath` |
| `utils/cos.js` | COS 凭证、上传、写 JSON |
| `utils/api.js` | 加载内容（COS → 本地回退） |
| `data/content.json` | 演示/同步源数据 |
| `pages/admin/` | 管理端（多配置设置、编辑、上传、连通性检测） |
| `utils/admin.js` | 管理员登录鉴权（调用 SCF、缓存、自动导入默认 COS） |
| `scf/adminAuth/` | 腾讯云 SCF：`code2session` + openid 白名单，下发默认 COS |
| `tools/cos-ping.js` | 本地 Node 连通性检测（`npm run cos:ping`） |
| `libs/cos-wx-sdk-v5.js` | 腾讯云小程序 SDK |

## COS 配置字段

管理端支持多套配置，存 Storage `cos_admin_profiles`：`{ activeId, list: [{ id, name, Bucket, Region, SecretId, SecretKey, baseUrl }] }`。激活项会同步写回旧 key `cos_admin_conf` 以兼容历史数据。

- `Bucket`：`桶名-APPID`
- `Region`：如 `ap-shanghai`
- `SecretId` / `SecretKey`：CAM **子用户**密钥
- `baseUrl`：COS/CDN 公网前缀（无末尾 `/`）

桶权限：**公有读私有写**。对象主文件：`data/content.json`。

## 游客端读取来源（易踩坑）

`getBaseUrl()` = 管理端 Storage 的 `baseUrl` || `config.js` 的 `baseUrl`。

游客没有 Storage，**只认 `config.js`**。所以 `config.js` 的 `baseUrl` 必须是真实域名且重新发布版本，否则其他用户只会看到打包的 `data/content.js` 演示数据。

「管理员能看到更新、其他人看不到」的排查顺序：mp 后台合法域名（`request` + `downloadFile`，注意 `project.config.json` 的 `urlCheck: false` 只对开发者工具生效）→ 是否重新发布版本 → 客户端缓存 → CDN 缓存。`isGuestBaseUrlReady()` / `getEnvVersion()` 供管理端首页与连通性检测提示。

内容实时性：`putContent` 写入带 `Cache-Control: no-cache`；`api.js` 有 Storage 持久缓存（`content_cache_v1`）与 `refreshInBackground()`，`app.onShow` 会静默刷新并回调页面的 `onContentUpdated()`。

## 管理员登录鉴权（腾讯云 SCF）

- `config.js` 的 `adminAuth.apiUrl` 填 SCF **函数 URL** 地址后启用；留空则开发期连点直接进入
- 进管理端：`wx.login()` 取 code → POST 给 SCF → `code2session` 换 openid → 命中 `adminOpenids` 白名单才 `isAdmin`
- 管理员名单优先读 SCF 环境变量 `ADMIN_OPENIDS`（英文逗号分隔）；增删名单无需更新小程序客户端
- 微信公众平台没有开放查询后台管理员/开发者角色的接口，不能直接复用其成员名单
- 管理员且服务端下发完整 `cos` 时，`utils/admin.js` **每次校验成功都会写入/覆盖**本机默认 COS 配置并启用，无需手填
- `appsecret` / 默认 COS 密钥只在 SCF 端（`scf/adminAuth/config.js`，gitignore），不进小程序包
- 函数 URL 主机名需加入 mp 后台 **request 合法域名**；部署见 `scf/adminAuth/README.md`（勿用已停新建的 API 网关触发器）

## 安全红线

- 不要把 `SecretId` / `SecretKey` / `appsecret` 写入代码或 Git（用 gitignore 的本地/SCF 机密文件）
- 不要在游客端路径使用密钥；默认 COS 配置只对校验通过的管理员下发
- `content.json` 勿放敏感信息（公有读可被直接访问）

## 给 Agent 的提示

- 改存储/上传逻辑先读 `utils/cos.js` 与 `docs/COS上手.md`
- **勿用 `wx.getUserProfile` 拉昵称/头像**（已收回）；用 `input type="nickname"` + form 提交，见 README「头像昵称」与 `utils/userProfile.js`
- 保持小程序结构与中文注释；避免无关重构
- Cursor 规则见 `.cursor/rules/wxtool-cos.mdc`
