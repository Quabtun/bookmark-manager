// 浏览器书签 HTML 导入 / Chrome 兼容导出（Netscape Bookmark 格式）
// 支持 Chrome/Edge JSON 格式自动导入

import fs from 'node:fs'
import path from 'node:path'
import { FAVICONS_DIR } from './store.js'

function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseTimestamp(attr) {
  // Chrome/Edge 用 ADD_DATE=Unix秒；有些用毫秒
  const m = attr.match(/ADD_DATE\s*=\s*["']?(\d+)/i)
  if (m) {
    const t = parseInt(m[1], 10)
    return t > 1e12 ? t : t * 1000
  }
  return null
}

function parseIcon(attr) {
  const m = attr.match(/ICON\s*=\s*["']([^"']+)["']/i)
  return m ? m[1] : null
}

// 解析 Netscape 格式书签 HTML → [{ title, url, addedAt, icon }]
export function parseBookmarksHtml(html) {
  const bookmarks = []

  // 清理 HTML 注释
  html = html.replace(/<!--[\s\S]*?-->/g, '')

  // 兼容大小写、多余空格、换行，多种属性格式
  // <a href="..." add_date="...">...
  // <DT><A HREF="..." ADD_DATE="...">...
  const aRe = /<a\b[^>]*?\bhref\s*=\s*["']([^"']*)["'][^>]*?>([\s\S]*?)<\/a\s*>/gi
  let m
  while ((m = aRe.exec(html)) !== null) {
    const fullTag = m[0]
    const url = (m[1] || '').trim()
    const rawTitle = m[2] || ''
    const title = decodeEntities(rawTitle) || url

    // 校验 URL
    if (!/^https?:\/\//i.test(url) && !/^ftp:\/\//i.test(url)) continue

    bookmarks.push({
      url,
      title: title.slice(0, 500),
      addedAt: parseTimestamp(fullTag),
      icon: parseIcon(fullTag)
    })
  }

  // 如果没有匹配到 <a ...> 但文件内容存在，尝试备选方案：逐行匹配
  if (bookmarks.length === 0 && html.includes('http')) {
    // 某些损坏/非标准格式的回退
    const fallbackRe = /HREF\s*=\s*["']?(https?:\/\/[^\s"'>]+)/gi
    let fm
    while ((fm = fallbackRe.exec(html)) !== null) {
      const url = fm[1]
      // 尝试找标题：在链接前找 >...< 之间的文本
      let title = url
      const before = html.substring(0, fm.index)
      const titleMatch = before.match(/>([^<>]*)<\s*$/m)
      if (titleMatch) {
        title = decodeEntities(titleMatch[1].trim()).slice(0, 300) || url
      }
      bookmarks.push({ url, title, addedAt: null, icon: null })
    }

    // 去重
    const seen = new Set()
    return bookmarks.filter((b) => {
      if (seen.has(b.url)) return false
      seen.add(b.url)
      return true
    })
  }

  return bookmarks
}

// 生成 Chrome 可导入的 Netscape 书签 HTML
export function exportBookmarksHtml(bookmarks, categories) {
  const esc = (s) => (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const catName = (id) => {
    const c = (categories || []).find((x) => x.id === id)
    return c ? c.name : '未分类'
  }

  // 按分类分组
  const groups = {}
  for (const bm of bookmarks) {
    const key = catName(bm.categoryId)
    if (!groups[key]) groups[key] = []
    groups[key].push(bm)
  }

  const now = Math.floor(Date.now() / 1000)
  const lines = []
  lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
  lines.push('<!-- This is an automatically generated file. -->')
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">')
  lines.push('<TITLE>Bookmarks</TITLE>')
  lines.push('<H1>Bookmarks</H1>')
  lines.push('<DL><p>')
  lines.push('    <DT><H3 ADD_DATE="' + now + '" LAST_MODIFIED="' + now + '" PERSONAL_TOOLBAR_FOLDER="true">书签管理器</H3>')
  lines.push('    <DL><p>')

  for (const [cat, list] of Object.entries(groups)) {
    lines.push('        <DT><H3 ADD_DATE="' + now + '">' + esc(cat) + '</H3>')
    lines.push('        <DL><p>')
    for (const bm of list) {
      const add = bm.addedAt ? Math.floor(bm.addedAt / 1000) : now
      lines.push('            <DT><A HREF="' + esc(bm.url) + '" ADD_DATE="' + add + '">' + esc(bm.title || bm.url) + '</A>')
    }
    lines.push('        </DL><p>')
  }

  lines.push('    </DL><p>')
  lines.push('</DL><p>')
  return lines.join('\n')
}

// ========== 导出整个分类文件夹（含子分类）为 Chrome 兼容 HTML ==========

export function exportCategoryFolderHtml(categoryId, categories, bookmarks) {
  const esc = (s) => (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const now = Math.floor(Date.now() / 1000)
  const lines = []

  // 构建子分类
  function getChildren(parentId) {
    return (categories || [])
      .filter(c => c.parentId === parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  function getBookmarksForCategory(catId) {
    return (bookmarks || []).filter(b => b.categoryId === catId)
  }

  // 递归生成分类树
  function renderCategory(cat, depth) {
    const indent = '    '.repeat(depth)
    const childCats = getChildren(cat.id)
    const catBookmarks = getBookmarksForCategory(cat.id)

    lines.push(`${indent}<DT><H3 ADD_DATE="${now}">${esc(cat.name)}</H3>`)
    lines.push(`${indent}<DL><p>`)

    for (const child of childCats) {
      renderCategory(child, depth + 1)
    }

    for (const bm of catBookmarks) {
      const add = bm.addedAt ? Math.floor(bm.addedAt / 1000) : now
      lines.push(`${indent}    <DT><A HREF="${esc(bm.url)}" ADD_DATE="${add}">${esc(bm.title || bm.url)}</A>`)
    }

    lines.push(`${indent}</DL><p>`)
  }

  lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
  lines.push('<!-- This is an automatically generated file. -->')
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">')
  lines.push('<TITLE>Bookmarks</TITLE>')
  lines.push('<H1>Bookmarks</H1>')
  lines.push('<DL><p>')

  const rootCat = (categories || []).find(c => c.id === categoryId)
  if (rootCat) {
    renderCategory(rootCat, 1)
  } else {
    // 分类不存在，直接输出该 categoryId 下的书签
    const catBookmarks = getBookmarksForCategory(categoryId)
    for (const bm of catBookmarks) {
      const add = bm.addedAt ? Math.floor(bm.addedAt / 1000) : now
      lines.push(`    <DT><A HREF="${esc(bm.url)}" ADD_DATE="${add}">${esc(bm.title || bm.url)}</A>`)
    }
  }

  lines.push('</DL><p>')
  return lines.join('\n')
}

// ========== CSV 导入 ==========

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { bookmarks: [] }

  // 解析 CSV 行（简单逗号分隔，支持双引号字段）
  function parseLine(line) {
    const fields = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
        else if (ch === '"') { inQuotes = false }
        else { current += ch }
      } else {
        if (ch === '"') { inQuotes = true }
        else if (ch === ',') { fields.push(current.trim()); current = '' }
        else { current += ch }
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseLine(lines[0]).map(h => h.toLowerCase())
  const urlIdx = headers.findIndex(h => ['url', 'link', 'href'].includes(h))
  const titleIdx = headers.findIndex(h => ['title', 'name'].includes(h))
  const descIdx = headers.findIndex(h => ['description', 'desc', 'note', 'notes', 'summary'].includes(h))
  const tagIndices = headers.map((h, i) => {
    if (i === urlIdx || i === titleIdx || i === descIdx) return -1
    if (['tag', 'tags', 'category', 'categories', 'folder', 'label', 'labels'].includes(h)) return i
    return -1
  }).filter(i => i !== -1)

  const bookmarks = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const fields = parseLine(lines[i])
    const url = urlIdx >= 0 ? (fields[urlIdx] || '').trim() : ''
    if (!url) continue
    const title = titleIdx >= 0 ? (fields[titleIdx] || '').trim() : url
    const description = descIdx >= 0 ? (fields[descIdx] || '').trim() : ''
    const tags = []
    for (const ti of tagIndices) {
      const val = (fields[ti] || '').trim()
      if (val) {
        // 支持多标签用逗号/分号/空格分隔
        val.split(/[,;|]/).map(t => t.trim()).filter(Boolean).forEach(t => {
          if (!tags.includes(t)) tags.push(t)
        })
      }
    }
    bookmarks.push({ url, title: title || url, tags, description })
  }

  return { bookmarks }
}

// ========== 浏览器自动检测 + Chrome JSON 导入 ==========

// 检测已安装浏览器的书签文件路径
export function detectBrowserBookmarks() {
  const localAppData = process.env.LOCALAPPDATA || ''
  const appData = process.env.APPDATA || ''
  const results = []

  // Chrome
  const chromePaths = [
    path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
    path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Profile 1', 'Bookmarks')
  ]
  for (const p of chromePaths) {
    if (fs.existsSync(p)) {
      results.push({ browser: 'chrome', name: 'Google Chrome', icon: '🔵', path: p })
      break
    }
  }

  // Edge
  const edgePaths = [
    path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks'),
    path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Profile 1', 'Bookmarks')
  ]
  for (const p of edgePaths) {
    if (fs.existsSync(p)) {
      results.push({ browser: 'edge', name: 'Microsoft Edge', icon: '🟢', path: p })
      break
    }
  }

  // Firefox 书签导入暂不支持（需 SQLite 解析）
  // TODO: 使用 better-sqlite3 解析 places.sqlite

  return results
}

// 解析 Chrome/Edge JSON 书签（保留文件夹结构信息）
function parseChromeJson(obj, result = [], folderPath = '') {
  if (!obj) return result
  if (obj.type === 'url' && obj.url) {
    result.push({
      url: obj.url,
      title: obj.name || obj.url,
      addedAt: obj.date_added ? parseInt(obj.date_added) : null,
      folder: folderPath || null  // 保留文件夹路径
    })
  }
  if (obj.children && Array.isArray(obj.children)) {
    const currentFolder = obj.name && obj.type === 'folder' ? (folderPath ? folderPath + ' / ' + obj.name : obj.name) : folderPath
    for (const child of obj.children) {
      parseChromeJson(child, result, currentFolder)
    }
  }
  return result
}

export function parseBrowserBookmarks(filePath) {
  // 判断是 JSON 还是 HTML
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.json' || filePath.endsWith('Bookmarks')) {
    // Chrome/Edge JSON 格式
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    const results = []
    if (data.roots) {
      for (const key of Object.keys(data.roots)) {
        parseChromeJson(data.roots[key], results)
      }
    }
    return results
  }
  // HTML 格式（原有逻辑）
  const html = fs.readFileSync(filePath, 'utf8')
  return parseBookmarksHtml(html)
}

// ========== 功能1: 导出为带样式的自包含 HTML ==========

export function exportStyledHtml(bookmarks, categories) {
  const esc = (s) => (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const catName = (id) => {
    const c = (categories || []).find((x) => x.id === id)
    return c ? c.name : '未分类'
  }

  const catIcon = (id) => {
    const c = (categories || []).find((x) => x.id === id)
    return c ? c.icon : '📄'
  }

  // 读取 favicon 并转为 base64 data URL
  function faviconDataUrl(faviconName) {
    if (!faviconName) return null
    try {
      const fp = path.join(FAVICONS_DIR, faviconName)
      if (!fs.existsSync(fp)) return null
      const buf = fs.readFileSync(fp)
      const ext = path.extname(fp).slice(1).toLowerCase()
      const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch { return null }
  }

  // 提取域名
  function getDomain(url) {
    try {
      return new URL(url).hostname
    } catch { return '' }
  }

  // 按分类分组
  const groups = {}
  for (const bm of bookmarks) {
    const key = catName(bm.categoryId)
    if (!groups[key]) groups[key] = { icon: catIcon(bm.categoryId), items: [] }
    groups[key].items.push(bm)
  }

  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const groupHtml = []
  for (const [catName_, group] of Object.entries(groups)) {
    const items = group.items
    const bookmarksHtml = items.map((bm) => {
      const title = esc(bm.title || bm.url)
      const url = esc(bm.url)
      const domain = esc(getDomain(bm.url))
      const desc = esc(bm.description || '')
      const faviconImg = (() => {
        const dataUrl = faviconDataUrl(bm.favicon)
        if (dataUrl) return `<img src="${dataUrl}" alt="" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;" />`
        return ''
      })()
      return `        <div class="bookmark-item">
          <div class="bookmark-header">
            ${faviconImg}
            <a href="${url}" target="_blank" rel="noopener" class="bookmark-title">${title}</a>
          </div>
          ${domain ? `<div class="bookmark-domain">${domain}</div>` : ''}
          ${desc ? `<div class="bookmark-desc">${desc}</div>` : ''}
        </div>`
    }).join('\n')

    groupHtml.push(`    <div class="category">
      <h2 class="category-title">${esc(group.icon)} ${esc(catName_)}</h2>
      <div class="bookmark-list">
${bookmarksHtml}
      </div>
    </div>`)
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>我的书签</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
    background: #f8fafc;
    color: #1e293b;
    line-height: 1.6;
    padding: 0;
  }
  .header {
    background: linear-gradient(135deg, #3563ff 0%, #1e42f5 100%);
    color: #fff;
    padding: 32px 40px 24px;
    margin-bottom: 24px;
  }
  .header h1 {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .header .date {
    font-size: 14px;
    opacity: 0.8;
  }
  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 24px 48px;
  }
  .category {
    margin-bottom: 28px;
  }
  .category-title {
    font-size: 18px;
    font-weight: 600;
    color: #334155;
    padding-bottom: 8px;
    border-bottom: 2px solid #e2e8f0;
    margin-bottom: 12px;
  }
  .bookmark-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }
  .bookmark-item {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
    transition: box-shadow 0.15s, border-color 0.15s;
  }
  .bookmark-item:hover {
    border-color: #3563ff;
    box-shadow: 0 2px 8px rgba(53, 99, 255, 0.1);
  }
  .bookmark-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .bookmark-title {
    font-size: 14px;
    font-weight: 500;
    color: #3563ff;
    text-decoration: none;
    word-break: break-all;
  }
  .bookmark-title:hover { text-decoration: underline; }
  .bookmark-domain {
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 2px;
  }
  .bookmark-desc {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .footer {
    text-align: center;
    color: #94a3b8;
    font-size: 12px;
    margin-top: 40px;
    padding: 16px;
    border-top: 1px solid #e2e8f0;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>我的书签</h1>
    <div class="date">导出日期：${dateStr} ｜ 共 ${bookmarks.length} 个书签</div>
  </div>
  <div class="container">
${groupHtml.join('\n')}
  </div>
  <div class="footer">由书签管理器导出</div>
</body>
</html>`
}

// ========== 功能10: 导出为 Markdown ==========

export function exportMarkdown(bookmarks, categories) {
  const catName = (id) => {
    const c = (categories || []).find((x) => x.id === id)
    return c ? c.name : '未分类'
  }

  // 转义 Markdown 特殊字符
  const escMd = (s) => s.replace(/([\\\[\]`*_~>|])/g, '\\$1')

  // 按分类分组
  const groups = {}
  for (const bm of bookmarks) {
    const key = catName(bm.categoryId)
    if (!groups[key]) groups[key] = []
    groups[key].push(bm)
  }

  const lines = ['# 我的书签', '']

  for (const [cat, list] of Object.entries(groups)) {
    lines.push(`## ${escMd(cat)}`)
    lines.push('')
    for (const bm of list) {
      const title = escMd(bm.title || bm.url)
      const desc = bm.description ? ` — ${escMd(bm.description)}` : ''
      lines.push(`- [${title}](${bm.url})${desc}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ========== 功能2: Pocket CSV 导入 ==========

export function parsePocketCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { bookmarks: [] }

  // 解析表头
  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())

  // Pocket CSV 常见列: title, url, tags, time_added, status
  // Instapaper CSV 类似: Title, URL, Selection, Timestamp, Folder
  const titleIdx = headers.findIndex(h => h === 'title')
  const urlIdx = headers.findIndex(h => h === 'url')
  const tagsIdx = headers.findIndex(h => h === 'tags')
  const statusIdx = headers.findIndex(h => h === 'status')

  if (urlIdx === -1) return { bookmarks: [] }

  const bookmarks = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCsvLine(line)
    const url = (cols[urlIdx] || '').trim()
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) continue

    const title = titleIdx !== -1 ? (cols[titleIdx] || '').trim() : url
    const rawTags = tagsIdx !== -1 ? (cols[tagsIdx] || '').trim() : ''
    const status = statusIdx !== -1 ? (cols[statusIdx] || '').trim() : ''
    const tags = rawTags ? rawTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : []

    // status=0 未读，status=1 已读（Pocket 格式）；可以加到 description
    const statusText = status === '0' ? '未读' : status === '1' ? '已读' : ''
    const description = statusText ? `Pocket: ${statusText}` : ''

    bookmarks.push({ url, title: title || url, tags, description })
  }
  return { bookmarks }
}

// 简易 CSV 行解析（支持引号内的逗号）
function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  result.push(current)
  return result
}
