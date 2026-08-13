# 椿屿影像 · 微信小程序 CI

**推送到 `master`（含 PR 合并进 master）** 即自动上传微信小程序。  
版本取自 `package.json` 的 `version`，并打 `v版本号` tag。  
**若远程已有同名 tag，流水线报错终止**——请先改 `package.json` 的 `version` 再推。

本地不需要单独发版命令，正常推到 master 即可。

## 流程

```text
push / merge → master
  → 读 package.json version（如 1.0.5）
  → 若已有 tag v1.0.5 → 失败退出
  → 创建并推送 tag v1.0.5
  → miniprogram-ci 上传到微信
```

可选：Actions 页手动 **Run workflow**，勾选 `submit_audit` 可在上传后提审。

## 一、微信后台准备

1. 登录 [微信公众平台](https://mp.weixin.qq.com) → **开发管理** → **开发设置** → **小程序代码上传**
2. 生成并下载私钥
3. **关闭 IP 白名单**（否则 GitHub Actions 常鉴权失败）
4. 确认已配置服务类目（若要提审）

## 二、GitHub Secrets

| Name | 说明 |
|------|------|
| `WX_PRIVATE_KEY` | 上传私钥全文 |
| `WX_APPID` | 可选；默认用 `project.config.json` |
| `WX_APPSECRET` | 仅手动提审时需要 |

## 三、日常怎么用

1. 发版前改好 `package.json` 的 `version`（勿与已有 tag 重复）  
2. 合并/推送到 `master`  
3. 到 Actions 看「微信小程序 CI」  
4. 微信后台看新版本 / 体验版  

## 四、本地调试上传（可选，非日常）

```bash
npm install
# 私钥：private.<appid>.key 或 WX_PRIVATE_KEY
npm run mp:upload -- --version 1.0.5 --desc "本地试传"
```

## 五、说明

- 过审发布默认仍在微信后台手动点「发布」  
- 私钥 / AppSecret 只放 Secrets，勿进仓库  
