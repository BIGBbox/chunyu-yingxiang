/**
 * SCF 机密配置——复制为 config.js 填入真实值（已 gitignore，勿提交）。
 * 也可改用 SCF 环境变量 WX_APPID / WX_APPSECRET / ADMIN_OPENIDS 覆盖。
 */
module.exports = {
  appid: 'wx1bb2d898b8bd9048',
  appsecret: '', // 小程序 appsecret（微信公众平台 → 开发管理 → 开发设置）
  // 推荐在 SCF 环境变量 ADMIN_OPENIDS 中维护，多个值用英文逗号分隔。
  // 仅未配置该环境变量时，才使用这里的白名单。
  adminOpenids: [
    // 'o6zAJswt4KYjoBlZFAv9kVDY38wg'
  ],
  // 校验通过后下发给管理员的默认 COS 配置（SecretId/SecretKey 必填，否则客户端无法自动写入）
  // 也可用环境变量 COS_BUCKET / COS_REGION / COS_SECRET_ID / COS_SECRET_KEY / COS_BASE_URL 覆盖
  cos: {
    name: '默认配置',
    Bucket: 'cyyx-1258097649',
    Region: 'ap-guangzhou',
    SecretId: '',
    SecretKey: '',
    baseUrl: 'https://cyyx-1258097649.cos.ap-guangzhou.myqcloud.com'
  }
}
