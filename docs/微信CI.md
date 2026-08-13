# 椿屿影像 · 微信小程序 CI

**推送到 `master`（含 PR 合并进 master）** 即自动上传代码到微信体验版。  
是否接着**提交审核**，由仓库根目录 `mp-ci.config.json` 控制。

版本取自 `package.json` 的 `version`，并打 `v版本号` tag。  
**若远程已有同名 tag，流水线报错终止**——请先改 `package.json` 的 `version` 再推。

## 提审开关

编辑 `mp-ci.config.json`：

```json
{
  "submitAudit": false
}
```

| `submitAudit` | 行为 |
|---------------|------|
| `false` 或缺省 | 只上传体验版 |
| `true` | 上传成功后自动提审 |

改完该文件并推到 `master` 即按新配置生效。需要提审时改成 `true` 再推；平时可保持 `false`，避免每次推送都进审核队列。

## 流程

```text
push / merge → master
  → 读 package.json version（如 1.0.5）
  → 若已有 tag v1.0.5 → 失败退出
  → 创建并推送 tag v1.0.5
  → miniprogram-ci 上传到微信
  → 若 mp-ci.config.json.submitAudit === true → 提交审核
```

过审后仍需在微信后台点「发布」上线（本流程不自动发布）。

## 一、微信后台准备

1. 登录 [微信公众平台](https://mp.weixin.qq.com) → **开发管理** → **开发设置** → **小程序代码上传**
2. 生成并下载私钥
3. **关闭 IP 白名单**（否则 GitHub Actions 常鉴权失败）
4. 提审前确认已配置服务类目

## 二、GitHub Secrets

| Name | 说明 |
|------|------|
| `WX_PRIVATE_KEY` | 上传私钥全文（必填） |
| `WX_APPSECRET` | AppSecret；仅当 `submitAudit: true` 时必填 |
| `WX_APPID` | 可选；默认用 `project.config.json` |

## 三、日常怎么用

1. 发版前改好 `package.json` 的 `version`（勿与已有 tag 重复）  
2. 需要提审则把 `mp-ci.config.json` 的 `submitAudit` 设为 `true`，否则保持 `false`  
3. 合并/推送到 `master`  
4. 到 Actions 看「微信小程序 CI」  
5. 若开启了提审：微信后台看审核状态，通过后点「发布」  

## 四、本地调试上传（可选，非日常）

```bash
npm install
# 私钥：private.<appid>.key 或 WX_PRIVATE_KEY
npm run mp:upload -- --version 1.0.5 --desc "本地试传"
# 提审另需 WX_APPSECRET
npm run mp:submit -- --desc "说明"
```

## 五、说明

- 私钥 / AppSecret 只放 Secrets，勿进仓库  
- 审核中不可重复提审；若失败请看 Actions 日志与微信后台原因  
