/**
 * 名片海报：下载资源 + canvas 拼接
 * 布局：上图（约 70%）叠工作室名/标签；下白底小程序码 + 引导文案
 */

const CARD_W = 750
const CARD_H = 1200
const FOOTER_H = 280
const PHOTO_H = CARD_H - FOOTER_H

function isRemoteUrl(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

function isWeixinAvatar(url) {
  const s = String(url || '')
  return /qlogo\.cn|wx\.qlogo|thirdwx\.qlogo/i.test(s)
}

function downloadToLocal(url) {
  if (!url) return Promise.reject(new Error('缺少图片地址'))
  // 已是本地临时/用户目录，无需下载
  if (!isRemoteUrl(url)) {
    return Promise.resolve(url)
  }
  if (isWeixinAvatar(url)) {
    return Promise.reject(new Error('微信头像不可用于画布'))
  }
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath)
        } else {
          reject(new Error('下载图片失败'))
        }
      },
      fail: (err) => reject(err || new Error('下载图片失败'))
    })
  })
}

function errText(e) {
  if (!e) return '生成失败'
  if (typeof e === 'string') return e
  return e.message || e.errMsg || '生成失败'
}

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: (err) => reject(new Error(errText(err) || '读取图片失败'))
    })
  })
}

function loadCanvasImage(canvas, src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('图片地址为空'))
      return
    }
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

function waitCanvasNode(component, selector, retries = 15) {
  return new Promise((resolve, reject) => {
    const tryQuery = (left) => {
      const q = component
        ? component.createSelectorQuery()
        : wx.createSelectorQuery()
      q.select(selector)
        .fields({ node: true, size: true })
        .exec((res) => {
          const node = res && res[0] && res[0].node
          if (node) {
            resolve({ canvas: node, width: res[0].width, height: res[0].height })
            return
          }
          if (left <= 0) {
            reject(new Error('画布初始化失败'))
            return
          }
          setTimeout(() => tryQuery(left - 1), 50)
        })
    }
    tryQuery(retries)
  })
}

function drawCoverContain(ctx, img, dx, dy, dw, dh, iw, ih) {
  const scale = Math.max(dw / iw, dh / ih)
  const sw = dw / scale
  const sh = dh / scale
  const sx = (iw - sw) / 2
  const sy = (ih - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

function drawRoundedImage(ctx, img, x, y, size, iw, ih) {
  const r = size / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  drawCoverContain(ctx, img, x, y, size, size, iw, ih)
  ctx.restore()
}

/**
 * @param {object} opts
 * @param {string} opts.photoPath 本地封面路径
 * @param {string} [opts.qrPath] 本地小程序码路径
 * @param {string} opts.studioName
 * @param {string[]} opts.tags
 * @param {WechatMiniprogram.Page.Instance} page 页面实例（查 canvas）
 * @param {string} [selector='#posterCanvas']
 * @returns {Promise<string>} 临时文件路径
 */
async function composeCard(opts) {
  const page = opts.page
  const selector = opts.selector || '#posterCanvas'
  const studioName = opts.studioName || '椿屿影像'
  const tags = Array.isArray(opts.tags) ? opts.tags : []
  const tagText = tags
    .map((t) => (String(t).startsWith('#') ? String(t) : `#${t}`))
    .join(' ')

  const photoLocal = await downloadToLocal(opts.photoPath)
  const photoInfo = await getImageInfo(photoLocal)

  let qrLocal = ''
  let qrInfo = null
  if (opts.qrPath) {
    try {
      qrLocal = await downloadToLocal(opts.qrPath)
      qrInfo = await getImageInfo(qrLocal)
    } catch (e) {
      qrLocal = ''
      qrInfo = null
    }
  }

  const { canvas } = await waitCanvasNode(page, selector)
  const dpr = 2
  canvas.width = CARD_W * dpr
  canvas.height = CARD_H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  // 背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 上半照片
  const photoImg = await loadCanvasImage(canvas, photoInfo.path || photoLocal)
  drawCoverContain(ctx, photoImg, 0, 0, CARD_W, PHOTO_H, photoInfo.width, photoInfo.height)

  // 底部渐变，保证白字可读
  const grad = ctx.createLinearGradient(0, PHOTO_H - 220, 0, PHOTO_H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = grad
  ctx.fillRect(0, PHOTO_H - 220, CARD_W, 220)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 44px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  const textPadX = 40
  ctx.fillText(studioName, textPadX, PHOTO_H - 72, CARD_W - textPadX * 2)

  if (tagText) {
    ctx.font = '28px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(tagText, textPadX, PHOTO_H - 28, CARD_W - textPadX * 2)
  }

  // 底栏
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, PHOTO_H, CARD_W, FOOTER_H)

  const qrSize = 160
  const qrX = 56
  const qrY = PHOTO_H + (FOOTER_H - qrSize) / 2

  if (qrLocal && qrInfo) {
    try {
      const qrImg = await loadCanvasImage(canvas, qrInfo.path || qrLocal)
      drawRoundedImage(ctx, qrImg, qrX, qrY, qrSize, qrInfo.width, qrInfo.height)
    } catch (e) {
      qrLocal = ''
    }
  }
  if (!(qrLocal && qrInfo)) {
    ctx.strokeStyle = '#dddddd'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(qrX + qrSize / 2, qrY + qrSize / 2, qrSize / 2 - 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#bbbbbb'
    ctx.font = '22px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('小程序码', qrX + qrSize / 2, qrY + qrSize / 2)
  }

  ctx.fillStyle = '#333333'
  ctx.font = '30px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const textX = qrX + qrSize + 36
  const textY = PHOTO_H + FOOTER_H / 2
  ctx.fillText('长按小程序码', textX, textY - 22)
  ctx.fillText('进入ta的个人主页', textX, textY + 22)

  const tempPath = await new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: CARD_W * dpr,
      height: CARD_H * dpr,
      destWidth: CARD_W * dpr,
      destHeight: CARD_H * dpr,
      fileType: 'png',
      quality: 1,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    })
  })
  return tempPath
}

/**
 * 动态分享名片
 * 顶栏：默认头像圈 + 昵称 +「为你推荐了一个动态」
 * 中部：所选动态图
 * 底栏：工作室名 + 小程序码
 */
async function composeFeedCard(opts) {
  const page = opts.page
  const selector = opts.selector || '#posterCanvas'
  const studioName = opts.studioName || '椿屿影像'
  const nickName = opts.nickName || '微信用户'

  const photoLocal = await downloadToLocal(opts.photoPath)
  const photoInfo = await getImageInfo(photoLocal)

  let qrLocal = ''
  let qrInfo = null
  if (opts.qrPath) {
    try {
      qrLocal = await downloadToLocal(opts.qrPath)
      qrInfo = await getImageInfo(qrLocal)
    } catch (e) {
      qrLocal = ''
      qrInfo = null
    }
  }

  const { canvas } = await waitCanvasNode(page, selector)
  const dpr = 2
  canvas.width = CARD_W * dpr
  canvas.height = CARD_H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const W = CARD_W
  const H = CARD_H
  const pad = 40
  const headerH = 140
  const footerH = 280
  const imgTop = headerH
  const imgH = H - headerH - footerH

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const avSize = 72
  const avX = pad
  const avY = (headerH - avSize) / 2
  ctx.fillStyle = '#e8e8e8'
  ctx.beginPath()
  ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#111111'
  ctx.font = 'bold 30px sans-serif'
  const nameX = avX + avSize + 20
  ctx.fillText(nickName, nameX, headerH / 2 - 16, W - nameX - pad)
  ctx.fillStyle = '#999999'
  ctx.font = '24px sans-serif'
  ctx.fillText('为你推荐了一个动态', nameX, headerH / 2 + 20, W - nameX - pad)

  const photoImg = await loadCanvasImage(canvas, photoInfo.path || photoLocal)
  drawCoverContain(ctx, photoImg, pad, imgTop, W - pad * 2, imgH, photoInfo.width, photoInfo.height)

  const footY = imgTop + imgH
  ctx.strokeStyle = '#eeeeee'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, footY + 36)
  ctx.lineTo(W - pad - 200, footY + 36)
  ctx.stroke()

  ctx.fillStyle = '#999999'
  ctx.font = '22px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('长按识别二维码，进入小程序', pad, footY + 56)

  ctx.fillStyle = '#111111'
  ctx.font = 'bold 34px sans-serif'
  ctx.fillText(studioName, pad, footY + 100, W - pad * 2 - 200)

  ctx.fillStyle = '#888888'
  ctx.font = '26px sans-serif'
  ctx.fillText('查看该动态', pad, footY + 152)

  const qrSize = 150
  const qrX = W - pad - qrSize
  const qrY = footY + (footerH - qrSize) / 2 + 10
  let qrDrawn = false
  if (qrLocal && qrInfo) {
    try {
      const qrImg = await loadCanvasImage(canvas, qrInfo.path || qrLocal)
      drawRoundedImage(ctx, qrImg, qrX, qrY, qrSize, qrInfo.width, qrInfo.height)
      qrDrawn = true
    } catch (e) {
      qrDrawn = false
    }
  }
  if (!qrDrawn) {
    ctx.strokeStyle = '#dddddd'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(qrX + qrSize / 2, qrY + qrSize / 2, qrSize / 2 - 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#bbbbbb'
    ctx.font = '22px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('小程序码', qrX + qrSize / 2, qrY + qrSize / 2)
  }

  const tempPath = await new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: W * dpr,
      height: H * dpr,
      destWidth: W * dpr,
      destHeight: H * dpr,
      fileType: 'png',
      quality: 1,
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => reject(new Error(errText(err)))
    })
  })
  return tempPath
}

function saveToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    const doSave = () => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: reject
      })
    }
    wx.getSetting({
      success: (setting) => {
        if (setting.authSetting['scope.writePhotosAlbum']) {
          doSave()
          return
        }
        wx.authorize({
          scope: 'scope.writePhotosAlbum',
          success: doSave,
          fail: () => {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中允许保存到相册',
              confirmText: '去设置',
              success: (r) => {
                if (r.confirm) {
                  wx.openSetting({
                    success: (s) => {
                      if (s.authSetting['scope.writePhotosAlbum']) doSave()
                      else reject(new Error('未授权相册'))
                    },
                    fail: reject
                  })
                } else {
                  reject(new Error('未授权相册'))
                }
              }
            })
          }
        })
      },
      fail: reject
    })
  })
}

/** 封面列表 → 可选静帧（视频无 poster 则丢弃） */
function coversToPhotos(covers) {
  const list = []
  ;(covers || []).forEach((c, i) => {
    if (!c || !c.url) return
    if (c.type === 'video') {
      if (!c.poster) return
      list.push({ id: `cover_${i}`, url: c.poster, from: 'cover' })
    } else {
      list.push({ id: `cover_${i}`, url: c.url, from: 'cover' })
    }
  })
  return list
}

module.exports = {
  CARD_W,
  CARD_H,
  composeCard,
  composeFeedCard,
  saveToAlbum,
  coversToPhotos,
  downloadToLocal
}
