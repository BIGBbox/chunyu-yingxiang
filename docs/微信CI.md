# 椿屿影像 · 微信小程序 CI

**推送到 `master`（含 PR 合并进 master）** 即自动上传代码到微信。  
版本取自 `package.json` 的 `version`，并打 `v版本号` tag。  
**若远程已有同名 tag，流水线报错终止**——请先改 `package.json` 的 `version` 再推。

提交审核、发布需在 [微信公众平台](https://mp.weixin.qq.com/) → 版本管理 手动操作（自有小程序无开放提审接口）。

## 流程

```text
push / merge → master
  → 读 package.json version
  → 若已有同名 tag → 失败退出
  → 创建并推送 tag
  → miniprogram-ci 上传（备注取最近提交说明，不含版本号）
```

## 一、微信后台准备

1. 登录 [微信公众平台](https://mp.weixin.qq.com) → **开发管理** → **开发设置** → **小程序代码上传**
2. 生成并下载私钥
3. **关闭 IP 白名单**（否则 GitHub Actions 常鉴权失败）

## 二、GitHub Secrets

| Name | 说明 |
|------|------|
| `WX_PRIVATE_KEY` | 上传私钥全文（必填） |
| `WX_APPID` | 可选；默认用 `project.config.json` |

## 三、日常怎么用

1. 改好 `package.json` 的 `version`（勿与已有 tag 重复）  
2. 推到 `master`，到 Actions 确认上传成功  
3. 需要发版时：公众平台 → 版本管理 → 提交审核 → 通过后发布  

## 四、本地调试上传（可选）

```bash
npm install
npm run mp:upload -- --version 1.0.5 --desc "本地试传"
```

## 五、说明

- 私钥只放 Secrets，勿进仓库  
