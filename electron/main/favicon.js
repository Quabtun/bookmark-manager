import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { requestWithTimeout, downloadLimited } from './http.js'
import { FAVICONS_DIR } from './store.js'

function hashOf(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

// 从 HTML 中解析 favicon 链接候选
function extractIconsFromHtml(html, baseUrl) {
  const candidates = []
  // link rel="icon" / "shortcut icon" / "apple-touch-icon"
  const re = /<link[^>]*>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    const relMatch = tag.match(/rel\s*=\s*["']([^"']+)["']/i)
    if (!relMatch) continue
    const rel = relMatch[1].toLowerCase()
    if (!/icon/.test(rel)) continue
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue
    try {
      const abs = new URL(hrefMatch[1], baseUrl).toString()
      // 优先 apple-touch-icon(通常较大) ，其次 shortcut/icon
      const priority = /apple-touch-icon/.test(rel) ? 0 : 1
      candidates.push({ url: abs, priority })
    } catch { /* ignore */ }
  }
  candidates.sort((a, b) => a.priority - b.priority)
  return candidates
}

export async function fetchFavicon(url) {
  const u = new URL(url)
  const origin = u.origin
  const hash = hashOf(url)
  const ext = '.png'

  // 已存在则直接返回
  const cachedPath = path.join(FAVICONS_DIR, hash + ext)
  const cachedIco = path.join(FAVICONS_DIR, hash + '.ico')
  if (fs.existsSync(cachedPath)) return hash + ext
  if (fs.existsSync(cachedIco)) return hash + '.ico'

  const candidates = []

  // 1) 读取 HTML 获取 link 标签
  try {
    const r = await requestWithTimeout(origin, { method: 'GET', timeout: 8000, followRedirect: true })
    if (r.status >= 200 && r.status < 400) {
      const html = r.body.toString('utf8').slice(0, 200000)
      const icons = extractIconsFromHtml(html, origin)
      icons.forEach((i) => candidates.push(i.url))
    }
  } catch { /* ignore */ }

  // 2) /favicon.ico
  candidates.push(origin + '/favicon.ico')

  // 3) Google S2 兜底
  candidates.push('https://www.google.com/s2/favicons?sz=64&domain=' + u.hostname)

  // 逐个尝试下载
  for (const cu of candidates) {
    try {
      const r = await downloadLimited(cu, 512 * 1024, 8000)
      if (r.status >= 200 && r.status < 400 && r.body && r.body.length > 100) {
        const ct = (r.headers['content-type'] || '').toLowerCase()
        let saveExt = '.png'
        if (ct.includes('icon') || cu.endsWith('.ico')) saveExt = '.ico'
        else if (ct.includes('jpeg') || ct.includes('jpg')) saveExt = '.jpg'
        else if (ct.includes('svg')) saveExt = '.svg'
        // Google S2 返回 png
        if (cu.includes('google.com/s2')) saveExt = '.png'
        const p = path.join(FAVICONS_DIR, hash + saveExt)
        fs.writeFileSync(p, r.body)
        return hash + saveExt
      }
    } catch { /* next */ }
  }
  return null
}

export function faviconPath(fileName) {
  if (!fileName) return null
  return path.join(FAVICONS_DIR, fileName)
}
