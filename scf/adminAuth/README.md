# adminAuth · 腾讯云 SCF 管理员鉴权

小程序进入管理端前调用它校验管理员身份，并向管理员下发默认 COS 配置。

> 注意：API 网关触发器已停止新建（2024-07-01 起），请改用 **函数 URL**。

## 部署步骤

1. 登录 [腾讯云 SCF 控制台](https://console.cloud.tencent.com/scf) → 新建函数
   - 函数名称：`adminAuth`
   - 函数类型：**事件函数**（不要选 Web 函数）
   - 运行环境：Node.js 16+
   - 提交方法：本地上传本目录 zip（含 `index.js`、`config.js`、`package.json`）
   - 执行方法：`index.main_handler`
2. 机密配置（二选一）：
   - 复制 `config.example.js` 为 `config.js`，填入 `appsecret` / `adminOpenids` / **完整 `cos`（含 SecretId、SecretKey）**，随函数一起上传
   - 或在 SCF「函数配置 → 环境变量」里配置：
     - `WX_APPID`、`WX_APPSECRET`、`ADMIN_OPENIDS`
     - COS：`COS_BUCKET`、`COS_REGION`、`COS_SECRET_ID`、`COS_SECRET_KEY`，可选 `COS_BASE_URL`、`COS_NAME`（环境变量齐全时优先于 `config.js` 的 `cos`）
   - `ADMIN_OPENIDS` 支持多个 openid，用英文逗号分隔；环境变量非空时优先于 `config.js`
   - 管理员登录校验成功后，小程序会**自动把 COS 写入本机**，不必在管理端手填密钥
3. 开启 **函数 URL**（与触发器同级，不是「API 网关触发器」）
   - 路径：函数详情 → **函数 URL** → 启用
   - 访问类型：选 **公网**
   - 鉴权方式：选 **免鉴权**（小程序 `wx.request` 无法带腾讯云签名）
   - 请求方法：允许 `POST`（也可勾选 `OPTIONS` 方便调试）
   - 启用后得到形如：  
     `https://<appid>-<id>.<region>.tencentscf.com`
4. 把该 HTTPS 地址填进：
   - 小程序根目录 [`config.js`](../../config.js) 的 `adminAuth.apiUrl`（不要末尾 `/`）
   - 微信公众平台 → 开发管理 → 开发设置 → 服务器域名 → **request 合法域名**  
     （只填主机名，例如 `1234567890-xxxx.ap-guangzhou.tencentscf.com`）

## 本地自测（可选）

```bash
curl -X POST "https://你的函数URL" \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"假code仅测连通\"}"
```

能返回 JSON（哪怕 `isAdmin:false` / `code2session` 报错）说明 HTTP 通路正常。

## 拿到自己的 openid（推荐）

白名单为空时任何人都不是管理员。对方用自己的微信打开小程序，**连点首页标题**进入管理：

1. 若不是管理员，会**自动复制 openid 到剪贴板**，并弹窗展示完整字符串
2. 把该 openid **原样粘贴**进 SCF 环境变量 `ADMIN_OPENIDS`（多个用英文逗号分隔）
3. 保存后等几十秒或重新部署函数，让冷启动读到新环境变量
4. **不要手打**：openid 里 `0`（零）和 `O`（字母）极易抄错，抄错会一直 `isAdmin:false`

以后增删管理员，只需在腾讯云 SCF 控制台修改 `ADMIN_OPENIDS`，无需修改代码、重新上传小程序或发布新客户端。

> 微信公众平台没有提供“查询小程序后台管理员/开发者成员角色”的公开接口。`code2session` 只能得到 openid，无法判断该微信是否属于后台管理员或开发者，因此不能自动复用公众平台成员名单。

### 排查 `isAdmin:false`

1. 对比接口返回的 `openid` 与环境变量是否**逐字相同**（重点看 `0` / `O`）
2. 环境变量名必须是 `ADMIN_OPENIDS`（不要写成 `ADMIN_OPENIDSbbb`）
3. 改完环境变量后看 SCF **日志**：应出现 `tag:"adminAuth"`，含 `whitelistCount`、`isAdmin`
4. 若完全没有这条日志，说明线上跑的还是旧代码，请重新上传部署本目录的 `index.js`
5. 执行超时建议 ≥ 10 秒（`code2session` 要访问微信接口）

## 安全

- `appsecret`、COS 密钥只在 SCF 端；不进小程序包、不进 Git（`config.js` 已 gitignore）
- 只有 openid 命中白名单，才会返回 `isAdmin:true` 与 `cos` 配置
- 函数 URL 选「免鉴权」后，任何人都能 POST 到该地址，但拿不到密钥——最多拿到自己的 openid 与 `isAdmin:false`
