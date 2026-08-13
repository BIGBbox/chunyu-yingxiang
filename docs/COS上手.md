# COS 低成本方案上手指南

本项目**不再依赖微信云开发付费套餐**。图片与文案都放在腾讯云 COS，按量计费，流量不大时通常远低于 19.9 元/月。

## 架构

```
小程序游客端 ──GET──► COS 公网
                      ├─ data/content.json   （系列/客片文案/门店/社交）
                      └─ styles|series|...   （图片文件）

管理员手机 ──密钥上传──► COS（密钥只存在本机，不进代码）
```

## 零、管理员登录鉴权（可选，腾讯云 SCF）

想让管理员免手填 COS、且限制只有指定微信能进管理端时，部署一个腾讯云云函数：

1. 按 [`scf/adminAuth/README.md`](../scf/adminAuth/README.md) 部署函数并开启 **函数 URL**（API 网关触发器已停新建）
2. 在 SCF 环境变量填 `WX_APPID`、`WX_APPSECRET`、`ADMIN_OPENIDS`；**完整 COS**（含 `SecretId` / `SecretKey`）放函数端 `config.js`，或用环境变量 `COS_BUCKET` / `COS_REGION` / `COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BASE_URL`
3. 把函数 URL 的 HTTPS 地址填进小程序 [`config.js`](../config.js) 的 `adminAuth.apiUrl`，并加入 mp 后台 **request 合法域名**

管理员连点标题校验通过后，小程序会**自动把 COS 写入本机**，不必在管理端手填密钥。留空 `adminAuth.apiUrl` 时不启用鉴权，连点标题即可进管理端（开发期需自己填 COS）。
以后增删管理员只改 SCF 环境变量 `ADMIN_OPENIDS`（英文逗号分隔），不需要更新或重新发布小程序客户端。

## 一、开通 COS 并创建存储桶（约 10 分钟）

### 1. 登录并开通服务

1. 打开 [腾讯云控制台](https://cloud.tencent.com/) 并登录（个人/企业账号均可）
2. 顶部搜索 **「对象存储」** 或进入 [COS 控制台](https://console.cloud.tencent.com/cos)
3. 若首次使用，按提示 **开通对象存储 COS**（同意服务协议即可）

### 2. 创建存储桶（逐步点选）

1. 进入 **存储桶列表** → 点击 **创建存储桶**
2. 填写：
   - **名称**：自定义短名，如 `xgty`（控制台会自动拼成 `xgty-你的APPID`）
   - **所属地域**：选离用户近的，椿屿影像建议 **上海**（`ap-shanghai`）；也可选广州 `ap-guangzhou`
   - **访问权限**：选 **公有读私有写**
     - 游客可通过 URL 读图片和 `content.json`
     - 写入/覆盖仍必须带密钥（管理端上传）
   - 其余项（版本控制、日志等）可先保持默认
3. 确认创建，进入该桶

### 3. 抄下三个对接字段

在桶的 **概览** 或 **域名管理** 中记录：

| 字段 | 哪里看 | 示例 |
|------|--------|------|
| **Bucket** | 存储桶名称（含 APPID） | `xgty-1250000000` |
| **Region** | 所属地域简写 | `ap-shanghai` |
| **访问域名 / baseUrl** | 域名管理 → 默认 CDN/源站域名，**不要末尾 `/`** | `https://xgty-1250000000.cos.ap-shanghai.myqcloud.com` |

> 这些字段填进 **SCF 端** `scf/adminAuth/config.js`（或 COS_* 环境变量）。管理员登录成功后会自动同步到手机，一般不用在小程序里手填。

### 4. 创建 CAM 子用户密钥（不要用主账号）

1. 打开 [访问管理 CAM](https://console.cloud.tencent.com/cam) → **用户** → **用户列表** → **新建用户**
2. 选 **自定义创建** → 勾选 **编程访问**（需要 API 密钥）
3. 权限：只勾选与 **COS / 对象存储** 相关的策略（最小权限即可，例如该桶的读写）
4. 创建完成后，在用户详情里 **生成密钥**，得到：
   - `SecretId`
   - `SecretKey`
5. **立刻离线保存**到密码管理器；丢失只能作废再生成

**红线：**

- 不要用主账号密钥
- 不要把 `SecretId` / `SecretKey` 写进小程序 `config.js` 或提交到 Git（只放 SCF 端 `config.js` 或环境变量）
- 管理员登录成功后密钥写入本机 Storage；换机再登录一次即可重新下发

> 可选：在 COS 控制台为桶绑定 **CDN 加速域名**，更省流量、更快。把项目里的 `baseUrl` 换成 CDN 域名即可，Bucket/Region/密钥不变。

### 5. 对象路径约定（本项目固定）

上传后桶内大致结构：

```
data/content.json          # 主文案与结构（系列/客片/门店/社交）
series/cover/              # 系列封面
styles/images/             # 客片轮播图
styles/gallery/            # 客片纵向大图
styles/avatar/             # 客片头像
store/env/、store/guide/   # 门店环境/指引图
social/qrcode|avatar|banner/
```

游客端通过 `baseUrl + 路径` 直接 GET；管理端用 SDK 上传并写回 `data/content.json`。

## 二、小程序后台配置域名

登录 [微信公众平台](https://mp.weixin.qq.com/) → 开发管理 → 开发设置 → 服务器域名：

- **request 合法域名**：你的 COS/CDN 域名（如 `xgty-1250000000.cos.ap-shanghai.myqcloud.com`，不要带 `https://`）
- **downloadFile 合法域名**：同上（图片加载）

开发阶段可在微信开发者工具勾选「不校验合法域名」。

## 三、项目里填写域名

编辑根目录 [`config.js`](../config.js)：

```js
module.exports = {
  baseUrl: 'https://你的桶-APPID.cos.ap-shanghai.myqcloud.com',
  contentPath: 'data/content.json',
  adminTapCount: 5
}
```

未填 `baseUrl` 时，小程序自动用本地 `data/content.js` 演示数据预览界面。

> **这一步决定其他人能否看到你的更新。**
> 管理端填的 baseUrl 只存在你自己手机里；其他用户的小程序读的是 `config.js` 这个静态值。
> 所以 `config.js` 必须改成真实域名并**重新发布小程序版本**，否则别人永远看到打包时的演示数据。

## 四、首次上传数据

1. 微信开发者工具打开本项目，填好真实 AppID（或测试号）
2. 首页标题「椿屿影像(热门系列)」**连点 5 次**进入管理（校验通过后会自动写入 SCF 下发的 COS）
3. 打开 **查看 COS 状态** 确认已同步；可点「开始检测」验证连通
4. 返回管理首页，点 **「上传本地演示数据到 COS」**
5. 浏览器访问：`你的baseUrl/data/content.json`，能看到 JSON 即成功
6. 下拉刷新首页，应能从 COS 读到数据

之后日常：在管理页上传真实照片、改套餐文案，点保存即可写回 COS。

### 多套配置

COS 密钥由 SCF 下发，小程序内只查看状态。换机后重新以管理员登录即可再次同步。若需临时排查，可在「查看 COS 状态」页清除本机缓存后重新登录。

### 本地 Node 检测（可选）

电脑上也可跑同样四步检测（与小程序工具并存，互不影响）：

```bash
cp tools/cos.local.example.json tools/cos.local.json
# 编辑 cos.local.json 填入真实凭证（该文件已在 .gitignore）
npm install
npm run cos:ping
```

## 五、费用大概多少

- 存储几 GB：通常每月 **几毛～几元**
- 流量：按实际下载量；客片图建议压缩、列表用较小封面
- **没有 19.9/月的固定云开发套餐费**

具体以腾讯云 COS 账单为准。

## 六、安全说明

- 游客端**不需要**任何密钥，只读公开 JSON/图片
- 管理员密钥由 SCF 下发到手机本地 `Storage`；换机后重新以管理员身份登录即可同步
- 桶为「公有读」时，知道 URL 的人都能读；不要把敏感信息放进 content.json
- 若担心被人刷流量，可后续改成 CDN + 防盗链，或签名 URL（需再加一点逻辑）

## 七、常见问题

**保存失败 / 上传失败？**  
检查子账号是否有该桶写权限、Bucket/Region 是否写对（Bucket 必须带 `-APPID`）。也可在管理端 **查看 COS 状态** 里点「开始检测」定位是鉴权还是写入失败。

**首页一直是本地演示图？**  
确认 `config.js` 的 `baseUrl` 已填，且 COS 上已有 `data/content.json`；然后下拉刷新。

**我这台改完了，其他人看到的还是旧数据？**

先明确：你的手机走 Storage 里的配置，**其他人只走 `config.js` 的 `baseUrl` + 线上发布的版本**。所以开发者工具里一切正常，不代表别人正常。按顺序查：

1. **合法域名**（最常见）：mp 后台 → 开发管理 → 服务器域名，把 COS 域名同时加入 **request** 与 **downloadFile**。
   本项目 `project.config.json` 里 `urlCheck: false`，开发者工具**不校验**域名，正式版会严格校验 —— 没配就直接请求失败，回退到打包的演示数据
2. **版本发布**：改过 `config.js` 后必须**重新发布**，否则线上版本仍是旧域名
3. **客户端缓存**：让对方杀掉小程序重进，或下拉刷新。回到前台已会自动静默刷新
4. **CDN 缓存**：绑了 CDN 的话去控制台刷新 `data/content.json`（写入已带 `no-cache`，但既有缓存需手动清）

管理端首页会显示当前运行环境与这份排查清单；连通性检测的「游客端可见性」一步也会核对 `config.js` 与当前配置是否一致。

**图片能开、文案不行？**  
多半是 request 合法域名没配，或 content.json 路径不对。

**浏览器能打开 JSON，小程序读不到？**  
检查合法域名是否去掉了 `https://`，以及是否已重新提交域名配置生效。
