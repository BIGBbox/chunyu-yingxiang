# 椿屿影像 · 微信小程序（COS 低成本方案）

客片浏览 + 套餐详情 + 门店信息。  
**图片与文案存放腾讯云 COS**，不依赖微信云开发 19.9 元/月套餐。

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
├── pages/                 # C 端 + 管理端
├── docs/COS上手.md        # 建桶与对接
├── tools/cos-ping.js      # 本地 COS 连通性检测
├── CLAUDE.md              # Claude Code / Agent 项目说明
└── .cursor/rules/         # Cursor 项目规则
```
