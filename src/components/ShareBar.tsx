/**
 * ShareBar — 文章底部分享栏（client:idle）
 *
 * 两种分享：
 *  1. 文字分享：复制「标题 + 简介 + 链接」到剪贴板
 *  2. 图片分享：客户端 canvas 绘制 1200×630 分享横卡（与站点横卡同构——
 *     文字居左、封面静图贴右、封面左缘向卡底渐隐），模态框预览后可下载 PNG；
 *     支持 Web Share API（files）时额外提供「系统分享」（手机上直接转发）。
 *
 * 封面静图来源（由 [...slug].astro 解析好传入）：图片封面用原图、
 * 引擎封面用 poster 海报；都没有时用 cover-fallback 的确定性渐变兜底，
 * 与列表/hero 占位同色。分享图固定浅色底（面向微信等外部场景），不随站点主题翻变。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { coverFallback } from '../lib/cover-fallback'

export interface ShareBarProps {
  title: string
  description?: string | null
  /** 文章绝对 URL（进文案、进二维码） */
  url: string
  /** 已格式化的发布日期字符串 */
  date: string
  /** 封面静图完整 URL（同源）；无则 canvas 画兜底渐变 */
  coverSrc?: string | null
  /** post.id，兜底渐变取色种子 + 下载文件名 */
  slug: string
  siteName: string
}

/** 分享图尺寸（og:image 同比例 1.9:1） */
const W = 1200
const H = 630

/* ---------------- canvas 绘制 ---------------- */

/** 逐字符按宽度换行，最多 maxLines 行，超长末行加省略号 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
): string[] {
  const chars = [...text.replace(/\s+/g, ' ').trim()]
  const lines: string[] = []
  let cur = ''
  let truncated = false
  for (let i = 0; i < chars.length; i++) {
    const test = cur + chars[i]
    if (ctx.measureText(test).width > maxW && cur !== '') {
      lines.push(cur)
      cur = chars[i]
      if (lines.length === maxLines) {
        truncated = true
        break
      }
    } else {
      cur = test
    }
  }
  if (truncated) {
    let last = cur
    while (last.length > 0 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1)
    lines.push(last + '…')
  } else if (cur) {
    lines.push(cur)
  }
  return lines
}

/** 单行按宽度截断加省略号 */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

/** 椭圆径向渐变亮斑（对应 CSS radial-gradient((rx*100)% (ry*100)% at cx% cy%, …)） */
function paintRadial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  colorEnd: string,
  endStop: number,
) {
  ctx.save()
  ctx.translate(x + w * cx, y + h * cy)
  ctx.scale(w * rx, h * ry)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  g.addColorStop(0, color)
  g.addColorStop(endStop, colorEnd)
  ctx.fillStyle = g
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()
}

/** canvas 版兜底渐变：与 cover-fallback.ts 的 css 三层结构一致（椭圆做近似） */
function paintFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: number,
  hue2: number,
) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  // 底层 linear(to left)
  const g3 = ctx.createLinearGradient(x + w, y, x, y)
  g3.addColorStop(0.18, `hsl(${hue} 46% 27%)`)
  g3.addColorStop(0.82, `hsl(${hue} 46% 27% / 0)`)
  ctx.fillStyle = g3
  ctx.fillRect(x, y, w, h)
  // 中层 radial(90% 130% at 55% 88%)
  paintRadial(ctx, x, y, w, h, 0.55, 0.88, 0.9, 1.3, `hsl(${hue} 55% 40% / 0.55)`, `hsl(${hue} 55% 40% / 0)`, 0.58)
  // 顶层 radial(120% 170% at 82% 26%)
  paintRadial(ctx, x, y, w, h, 0.82, 0.26, 1.2, 1.7, `hsl(${hue2} 60% 46% / 0.92)`, `hsl(${hue2} 60% 46% / 0)`, 0.62)
  ctx.restore()
}

/** 封面静图按 cover 裁切绘制；加载失败返回 false 走兜底 */
async function drawCover(ctx: CanvasRenderingContext2D, src: string, x: number, y: number, w: number, h: number) {
  const img = new Image()
  img.src = src
  await img.decode()
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h)
}

/** 左下角二维码（白底小卡 + 深色码），返回实际占用宽度 */
async function drawQR(ctx: CanvasRenderingContext2D, text: string, x: number, yBottom: number, area: number) {
  const { default: qrcode } = await import('qrcode-generator')
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const pad = 8
  const cell = Math.max(2, Math.floor((area - pad * 2) / n))
  const size = cell * n
  // 白底小卡
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, yBottom - area, area, area)
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, yBottom - area + 0.5, area - 1, area - 1)
  // 码（居中）
  ctx.fillStyle = '#111827'
  ctx.save()
  ctx.translate(x + (area - size) / 2, yBottom - area + (area - size) / 2)
  qr.renderTo2dContext(ctx, cell)
  ctx.restore()
  return area
}

/** 绘制整张分享横卡 */
async function paintCard(ctx: CanvasRenderingContext2D, props: ShareBarProps) {
  const { title, description, url, date, coverSrc, siteName, slug } = props
  const fb = coverFallback(slug)
  const pad = 68
  const coverX = 660
  const coverW = W - coverX

  // 底 + 右侧封面
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  let hasCover = false
  if (coverSrc) {
    try {
      await drawCover(ctx, coverSrc, coverX, 0, coverW, H)
      hasCover = true
    } catch {
      hasCover = false
    }
  }
  if (!hasCover) paintFallback(ctx, coverX, 0, coverW, H, fb.hue, fb.hue2)
  // 封面左缘渐隐入白底（与站点横卡同向）
  const fade = ctx.createLinearGradient(coverX, 0, coverX + 250, 0)
  fade.addColorStop(0, 'rgba(255,255,255,1)')
  fade.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = fade
  ctx.fillRect(coverX, 0, 250, H)

  // 字体栈（面向分享场景的系统字体，保证任何机器上中文不缺字）
  const sans = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
  const textW = coverX - pad - 36 // 左列文字可用宽度

  // 博客名
  ctx.textBaseline = 'alphabetic'
  ctx.font = `500 15px ${sans}`
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '3px'
  ctx.fillStyle = '#8a877e'
  ctx.fillText(siteName, pad, 106)
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'

  // 标题（最多 3 行）
  ctx.font = `700 40px ${sans}`
  ctx.fillStyle = '#1b1b18'
  const titleLines = wrapText(ctx, title, textW, 3)
  const titleLineH = 58
  let y = 172
  for (const line of titleLines) {
    ctx.fillText(line, pad, y)
    y += titleLineH
  }
  y -= titleLineH - 40

  // 简介（有则画，最多 2 行）
  if (description) {
    ctx.font = `400 18px ${sans}`
    ctx.fillStyle = '#5c5a53'
    const descLines = wrapText(ctx, description, textW, 2)
    y += 34
    for (const line of descLines) {
      ctx.fillText(line, pad, y)
      y += 30
    }
  }

  // 底部：二维码 + 日期/链接
  const qrArea = 116
  const qrBottom = H - pad
  await drawQR(ctx, url, pad, qrBottom, qrArea)
  const infoX = pad + qrArea + 24
  const infoW = coverX - infoX - 24
  ctx.textBaseline = 'alphabetic'
  ctx.font = `400 15px ${sans}`
  ctx.fillStyle = '#8a877e'
  ctx.fillText(date, infoX, qrBottom - qrArea + 34)
  ctx.font = `500 16px ${sans}`
  ctx.fillStyle = '#3f3d38'
  ctx.fillText(truncateToWidth(ctx, url.replace(/^https?:\/\//, ''), infoW), infoX, qrBottom - qrArea + 62)
  ctx.font = `400 13px ${sans}`
  ctx.fillStyle = '#b0ada4'
  ctx.fillText('扫码阅读全文', infoX, qrBottom - qrArea + 88)
}

/* ---------------- 组件 ---------------- */

export default function ShareBar(props: ShareBarProps) {
  const [open, setOpen] = useState(false)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const blobRef = useRef<Blob | null>(null)
  const objUrlRef = useRef<string | null>(null)

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.canShare === 'function')
    return () => {
      if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current)
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const shareText = [props.title, props.description ?? '', props.url].filter(Boolean).join('\n')

  async function copyText() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用（非安全上下文等），静默 */
    }
  }

  async function generate() {
    if (busy) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      await paintCard(ctx, props)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return
      blobRef.current = blob
      if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current)
      objUrlRef.current = URL.createObjectURL(blob)
      setImgUrl(objUrlRef.current)
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  function download() {
    const objUrl = objUrlRef.current
    if (!objUrl) return
    const a = document.createElement('a')
    a.href = objUrl
    a.download = `share-${props.slug}.png`
    a.click()
  }

  async function systemShare() {
    const blob = blobRef.current
    if (!blob) return
    const file = new File([blob], `share-${props.slug}.png`, { type: 'image/png' })
    try {
      await navigator.share({
        files: [file],
        title: props.title,
        text: [props.title, props.description ?? ''].filter(Boolean).join('\n'),
        url: props.url,
      })
    } catch {
      /* 用户取消分享 */
    }
  }

  return (
    <>
      <span className="share-btns">
        <button type="button" className="share-btn" onClick={copyText}>
          {copied ? '已复制 ✓' : '复制分享文字'}
        </button>
        <button type="button" className="share-btn" onClick={generate} disabled={busy}>
          {busy ? '生成中…' : '生成分享图'}
        </button>
      </span>

      {open && imgUrl && (
        <div className="share-overlay" onClick={close}>
          <div
            className="share-modal"
            role="dialog"
            aria-modal="true"
            aria-label="分享图预览"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="share-modal-head">
              <span>分享图预览</span>
              <button type="button" className="share-modal-close" onClick={close} aria-label="关闭">
                ×
              </button>
            </div>
            <img src={imgUrl} alt="文章分享图：标题、日期、二维码与封面" />
            <div className="share-actions">
              <button type="button" className="share-btn primary" onClick={download}>
                下载 PNG
              </button>
              {canShare && (
                <button type="button" className="share-btn" onClick={systemShare}>
                  系统分享
                </button>
              )}
              <button type="button" className="share-btn" onClick={copyText}>
                {copied ? '已复制 ✓' : '复制分享文字'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
