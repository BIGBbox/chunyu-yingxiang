/**
 * COS 方案配置（无需微信云开发付费套餐）
 *
 * baseUrl：桶的公网访问前缀（不要末尾 /）
 *   - 默认域名示例：https://你的桶名-APPID.cos.ap-shanghai.myqcloud.com
 *   - 或绑定 CDN：https://img.你的域名.com
 *
 * 未配置 baseUrl 时自动使用本地 data/content.json 预览
 *
 * adminAuth.apiUrl：腾讯云 SCF「函数 URL」的 HTTPS 地址（见 scf/adminAuth/README.md）。
 *   填写后启用「管理员登录鉴权」：进管理端前 wx.login() 换 code 交由 SCF 校验 openid 白名单，
 *   命中则放行并自动写入下发的默认 COS 配置；留空则视为未启用（开发期连点直接进入）。
 *   该地址需加入微信后台 request 合法域名（只填主机名，不含 https://）。
 *   注意：API 网关触发器已停新建，请用函数 URL，不要用 API 网关。
 */
module.exports = {
  baseUrl: 'https://cyyx-1258097649.cos.ap-guangzhou.myqcloud.com',
  contentPath: 'data/content.json',
  adminTapCount: 5,
  adminAuth: {
    enabled: true,
    apiUrl: 'https://1258097649-k7a6ryf93z.ap-guangzhou.tencentscf.com'
  },
  // COS 数据万象图片样式名（控制台已创建）；游客端开启水印时拼到 URL：原图/watermark
  imageStyle: 'watermark',
  // 客片详情「观看人数」假数据（所有人同一时刻看到同一数字）
  fakeViews: {
    launchDate: '2026-08-12', // 上线日 YYYY-MM-DD，从此日起缓慢上涨
    baseMin: 18, // 各客片底数下限（含）
    baseMax: 89 // 各客片底数上限（含）；同一客片始终落在同一底数
  }
}
