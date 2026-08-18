/**
 * 用户昵称 / 头像（本机缓存）
 *
 * 重要：不要再用 wx.getUserProfile / wx.getUserInfo 拉微信昵称头像。
 * 微信已收回该能力，真机与开发者工具都会直接 fail，看起来像「用户拒绝」。
 *
 * 正确做法（官方「头像昵称填写」）：
 * - 昵称：`<input type="nickname" name="nickname" />`，用 `<form bindsubmit>` 取值
 *   （点输入框后键盘上方可选微信昵称；勿只靠 bindblur/bindchange）
 * - 头像：`<button open-type="chooseAvatar" bindchooseavatar="...">`（本项目名片暂用默认头像圈）
 * - 用户跳过或未填：展示固定文案「微信用户」
 *
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html
 */

const KEY = 'share_user_profile_v1'
const DEFAULT_NICK = '微信用户'

function readProfile() {
  try {
    const raw = wx.getStorageSync(KEY)
    if (raw && (raw.nickName || raw.avatarUrl)) return raw
  } catch (e) {
    /* ignore */
  }
  return { nickName: '', avatarUrl: '' }
}

function writeProfile(profile) {
  try {
    wx.setStorageSync(KEY, {
      nickName: (profile && profile.nickName) || '',
      avatarUrl: (profile && profile.avatarUrl) || ''
    })
  } catch (e) {
    /* ignore */
  }
}

/** 表单提交里的昵称：有值则缓存并返回，否则返回「微信用户」 */
function resolveNickFromForm(formValue) {
  const nick = String((formValue && formValue.nickname) || '').trim()
  if (nick) {
    const prev = readProfile()
    writeProfile({ nickName: nick, avatarUrl: prev.avatarUrl || '' })
    return nick.slice(0, 32)
  }
  return DEFAULT_NICK
}

function cachedNickOrDefault() {
  const nick = String(readProfile().nickName || '').trim()
  return nick || DEFAULT_NICK
}

module.exports = {
  DEFAULT_NICK,
  readProfile,
  writeProfile,
  resolveNickFromForm,
  cachedNickOrDefault
}
