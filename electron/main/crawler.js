import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { requestWithTimeout, downloadLimited } from './http.js'
import { PREVIEWS_DIR, IMAGES_DIR, loadSettings } from './store.js'

function hashOf(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

// 抓取页面元数据：title / description / og:title / og:description / og:image / site_name
export async function fetchMeta(url) {
  const result = { title: '', description: '', ogTitle: '', ogDescription: '', ogImage: '', siteName: '', icon: '' }
  let html = ''
  try {
    // 先尝试 Range 请求（节省带宽），失败则完整 GET
    let r
    try {
      r = await requestWithTimeout(url, { method: 'GET', timeout: 5000, followRedirect: true, headers: { Range: 'bytes=0-' + (256 * 1024 - 1) } })
    } catch (e) {
      r = await requestWithTimeout(url, { method: 'GET', timeout: 5000, followRedirect: true })
    }
    if (!r || r.status < 200 || r.status >= 400) {
      // 再试一次不带 Range
      if (r && r.status === 416) {
        try { r = await requestWithTimeout(url, { method: 'GET', timeout: 5000, followRedirect: true }) } catch { return result }
      }
      if (!r || r.status < 200 || r.status >= 400) return result
    }
    // 检测 charset
    const contentType = r.headers && r.headers['content-type'] ? r.headers['content-type'] : ''
    const ctCharset = contentType.match(/charset=([^\s;]+)/i)
    const rawBuf = r.body || Buffer.alloc(0)
    const headStr = rawBuf.toString('latin1').slice(0, 2048)
    const metaCharset = headStr.match(/<meta[^>]*charset\s*=\s*["']?([^\s"'/>]+)/i)
    const charset = (ctCharset && ctCharset[1]) || (metaCharset && metaCharset[1]) || 'utf-8'
    let html
    try {
      html = rawBuf.toString(charset.toLowerCase().replace('gb2312', 'gbk')).slice(0, 512000)
    } catch {
      html = rawBuf.toString('utf8').slice(0, 512000)
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (titleMatch) result.title = decodeEntities(titleMatch[1].trim()).slice(0, 300)

    const metaRe = /<meta[^>]*>/gi
    let m
    const metas = {}
    while ((m = metaRe.exec(html)) !== null) {
      const tag = m[0]
      const nameM = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)
      const contentM = tag.match(/content\s*=\s*["']([^"']*)["']/i)
      if (nameM && contentM) metas[nameM[1].toLowerCase()] = decodeEntities(contentM[1])
    }
    result.description = metas['description'] || ''
    result.ogTitle = metas['og:title'] || ''
    result.ogDescription = metas['og:description'] || ''
    result.ogImage = metas['og:image'] || ''
    result.siteName = metas['og:site_name'] || ''
    // icon link
    const iconRe = /<link[^>]*rel\s*=\s*["'](?:shortcut icon|icon)["'][^>]*>/i
    const iconM = html.match(iconRe)
    if (iconM) {
      const hrefM = iconM[0].match(/href\s*=\s*["']([^"']+)["']/i)
      if (hrefM) {
        try { result.icon = new URL(hrefM[1], url).toString() } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return result
}

function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ')
    .trim()
}

// 生成并持久化预览：元数据 JSON 落盘 + og:image 下载到 images/
// 返回预览元信息（不含大图本体）
export async function generatePreview(url) {
  const hash = hashOf(url)
  const meta = await fetchMeta(url)
  const metaPath = path.join(PREVIEWS_DIR, hash + '.json')

  let imagePath = null
  let imageSize = 0
  if (meta.ogImage) {
    try {
      const r = await downloadLimited(meta.ogImage, 2 * 1024 * 1024, 10000)
      if (r && r.status >= 200 && r.status < 400 && r.body && r.body.length > 0) {
        const ext = guessExt(meta.ogImage, r.headers['content-type'])
        const p = path.join(IMAGES_DIR, hash + ext)
        fs.writeFileSync(p, r.body)
        imagePath = hash + ext
        imageSize = r.body.length
      }
    } catch { /* ignore image */ }
  }

  // 智能选择标题：og:title 比 title 更长/更丰富时优先使用
  const finalTitle = (() => {
    if (meta.ogTitle && meta.title) {
      // og:title 比原始 title 更长（去除首尾空白后比较），优先使用 og:title
      return meta.ogTitle.trim().length > meta.title.trim().length ? meta.ogTitle : meta.title
    }
    return meta.ogTitle || meta.title || ''
  })()
  // 智能选择描述：description 为空时回退到 og:description
  const finalDescription = meta.description || meta.ogDescription || ''

  const preview = {
    hash,
    url,
    title: finalTitle,
    description: finalDescription,
    ogImage: meta.ogImage || '',
    image: imagePath,
    imageSize,
    siteName: meta.siteName || '',
    icon: meta.icon || '',
    generatedAt: Date.now()
  }
  fs.writeFileSync(metaPath, JSON.stringify(preview, null, 2))
  // 写入访问时间，用于 LRU
  touchAccess(hash)
  try { enforceCacheLimit() } catch { /* ignore */ }
  return preview
}

function guessExt(url, contentType) {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('png')) return '.png'
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg'
  if (ct.includes('webp')) return '.webp'
  if (ct.includes('svg')) return '.svg'
  if (ct.includes('gif')) return '.gif'
  const m = url.match(/\.(png|jpe?g|webp|svg|gif)(\?|$)/i)
  return m ? '.' + m[1].toLowerCase() : '.png'
}

export function getPreview(url) {
  const hash = hashOf(url)
  const metaPath = path.join(PREVIEWS_DIR, hash + '.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    touchAccess(hash)
    return data
  } catch { return null }
}

export function previewMetaPath(url) {
  return path.join(PREVIEWS_DIR, hashOf(url) + '.json')
}
export function previewImageName(url) {
  const p = getPreview(url)
  return p && p.image ? p.image : null
}
export function previewImagePath(name) {
  if (!name) return null
  return path.join(IMAGES_DIR, name)
}

function accessFile(hash) {
  return path.join(PREVIEWS_DIR, hash + '.access')
}
function touchAccess(hash) {
  try { fs.writeFileSync(accessFile(hash), String(Date.now())) } catch { /* ignore */ }
}
function readAccess(hash) {
  try { return parseInt(fs.readFileSync(accessFile(hash), 'utf8'), 10) || 0 } catch { return 0 }
}

// 计算 images 目录占用大小（字节）
export function getImagesSize() {
  let total = 0
  try {
    const files = fs.readdirSync(IMAGES_DIR)
    for (const f of files) {
      try { total += fs.statSync(path.join(IMAGES_DIR, f)).size } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return total
}

// 超过上限时清理：删除最久未访问的图片，但保留元数据 JSON
// 删除图片时同步更新对应 preview JSON 的 image/imageSize 字段
export function enforceCacheLimit() {
  const settings = loadSettings()
  const limitMB = settings.previewCacheLimitMB || 200
  const limitBytes = limitMB * 1024 * 1024

  const entries = []
  try {
    const files = fs.readdirSync(IMAGES_DIR)
    for (const f of files) {
      const full = path.join(IMAGES_DIR, f)
      try {
        const stat = fs.statSync(full)
        const hash = f.replace(/\.[^.]+$/, '')
        entries.push({ file: f, full, size: stat.size, atime: readAccess(hash) || stat.atimeMs })
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  let total = entries.reduce((s, e) => s + e.size, 0)
  const totalBefore = total
  if (total <= limitBytes) return { cleaned: 0, totalBefore, totalAfter: total }

  // 按 atime 升序（最旧的先删）
  entries.sort((a, b) => a.atime - b.atime)
  let cleaned = 0
  for (const e of entries) {
    if (total <= limitBytes) break
    try {
      fs.unlinkSync(e.full)
      total -= e.size
      cleaned++
      // 更新对应 preview JSON
      const hash = e.file.replace(/\.[^.]+$/, '')
      const metaPath = path.join(PREVIEWS_DIR, hash + '.json')
      if (fs.existsSync(metaPath)) {
        const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        data.image = null
        data.imageSize = 0
        data.imageEvictedAt = Date.now()
        fs.writeFileSync(metaPath, JSON.stringify(data, null, 2))
      }
    } catch { /* ignore */ }
  }
  return { cleaned, totalBefore, totalAfter: total }
}

// 批量生成预览
export async function generateBatch(urls, { limit = 4, onProgress } = {}) {
  let done = 0
  const total = urls.length
  const results = []
  const queue = [...urls]
  const workers = Array.from({ length: Math.min(limit, urls.length) }, async () => {
    while (queue.length) {
      const url = queue.shift()
      try {
        const preview = await generatePreview(url)
        results.push({ url, preview, ok: true })
      } catch (e) {
        results.push({ url, preview: null, ok: false, error: e.message })
      }
      done++
      onProgress && onProgress(done, total, url)
      // 每完成若干个检查一次缓存上限
      if (done % 5 === 0) {
        try { enforceCacheLimit() } catch { /* ignore */ }
      }
    }
  })
  await Promise.all(workers)
  // 最终再清理一次
  try { enforceCacheLimit() } catch { /* ignore */ }
  return results
}
