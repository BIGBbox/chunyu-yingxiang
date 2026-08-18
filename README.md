# 椿屿影像 · 微信小程序（COS储存方案）

客片浏览 + 套餐详情 + 门店信息。  
**图片与文案存放腾讯云 COS**

## 功能

- 首页系列、搜索、社交账号、门店入口
- 系列列表 → **客片详情**（顶部轮播 + 套餐文案 + 纵向大图）
- 管理端（首页标题连点 5 次）：配置 COS、上传图片、编辑文案

## 快速开始

1. 微信开发者工具打开本目录  
2. 未配 COS 时可直接预览本地演示数据  
3. 正式使用按 [docs/COS上手.md](docs/COS上手.md) 开通桶并上传 `content.json`

## COS 连通性检测

- **小程序内**：管理端 → 查看 COS 状态 →「开始检测」
- **本地 Node**：复制 `tools/cos.local.example.json` 为 `tools/cos.local.json`，填入密钥后执行：

```bash
npm install
npm run cos:ping
```

- **GitHub 自动上传**：推送到 `master` 即触发；用 `package.json` 的 version 打 tag，tag 已存在则失败。提审/发布需在公众平台手动操作。见 [docs/微信CI.md](docs/微信CI.md)。

## 配置

[`config.js`](config.js) 中填写：

```js
baseUrl: 'https://你的桶-APPID.cos.ap-shanghai.myqcloud.com'
```

## 目录

```
├── config.js              # COS 公网域名
├── data/content.json      # 文案与结构（同步到 COS）
├── libs/cos-wx-sdk-v5.js  # 腾讯云 COS 小程序 SDK
├── utils/cos.js           # 上传 / 读写 JSON
├── utils/api.js           # 业务读取封装
├── utils/userProfile.js   # 昵称缓存（见下方「头像昵称」）
├── pages/                 # C 端 + 管理端
├── docs/COS上手.md        # 建桶与对接
├── tools/cos-ping.js      # 本地 COS 连通性检测
├── CLAUDE.md              # Claude Code / Agent 项目说明
└── .cursor/rules/         # Cursor 项目规则
```

## 头像昵称（勿再试错）

**不要**使用 `wx.getUserProfile` / `wx.getUserInfo` 拉微信昵称或头像。  
该能力已被微信收回：开发者工具与真机都会直接 `fail`，看起来像「用户拒绝授权」，本地也测不出旧弹窗。

**正确做法**（官方 [头像昵称填写](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html)）：

| 需求 | 写法 |
|------|------|
| 昵称 | `<input type="nickname" name="nickname" />`，用 `<form bindsubmit>` 取 `e.detail.value.nickname` |
| 头像 | `<button open-type="chooseAvatar" bindchooseavatar="...">` |
| 未填 / 跳过 | 固定展示「微信用户」 |

注意：

- 点 `type="nickname"` 输入框后，键盘上方可选微信昵称；**不要只靠 `bindblur` / `bindchange` 取值**（安全检测异步，易拿不到）
- 微信头像 CDN（`qlogo.cn` 等）**不能**用于 canvas `getImageInfo`，名片请用本地默认头像圈
- 本机缓存封装：`utils/userProfile.js`（`resolveNickFromForm` / `writeProfile`）
- 已接入：动态评论（首页 / 列表 / 详情）、动态朋友圈名片（`pages/poster/feed`）
