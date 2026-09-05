import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  loadBookmarks, saveBookmarks,
  loadCategories, saveCategories,
  loadSettings, saveSettings,
  FILES, FAVICONS_DIR, IMAGES_DIR, DATA_DIR, DEFAULT_DATA_DIR,
  getDataDir, setDataDir, saveDataDirPreference
} from './store.js'
import { startAutoBackup, stopAutoBackup, createBackupNow, listBackups } from './backup.js'
import { createPreviewWindow, closePreviewWindow, listPreviewWindows, closeAllPreviewWindows, focusPreviewWindow } from './preview-windows.js'
import { loadAllPlugins, unloadAllPlugins, getLoadedPlugins, getPluginStatus, loadPlugin, unloadPlugin, getPluginSettingsHtml, getPluginTabHtml, scanPlugins } from './plugins.js'
import { requestWithTimeout, clearProxyCache } from './http.js'
import { validateUrl, validateBatch } from './validator.js'
import { generatePreview, generateBatch, getPreview, previewImagePath, previewImageName, getImagesSize, enforceCacheLimit } from './crawler.js'
import { fetchFavicon } from './favicon.js'
import { lookupGeo, isGeoipReady, downloadDb, getDbInfo, getAllDbInfo, checkDbUpdate, deleteDefaultDb } from './geoip.js'
import { lookupWhois, isWhoisReady } from './whois.js'
import { suggestCategory, suggestBatch, applyAutoClassify } from './classifier.js'
import { createSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot } from './snapshot.js'
import { openInBrowser, detectBrowsers } from './browser.js'
import { parseBookmarksHtml, exportBookmarksHtml, exportCategoryFolderHtml, detectBrowserBookmarks, parseBrowserBookmarks, exportStyledHtml, parsePocketCsv, exportMarkdown, parseCsv } from './browserimport.js'
import {
  getAllCredentials, addCredential, updateCredential, deleteCredential, revealPassword,
  resetCredentialCache
} from './credentials.js'
import {
  openLoginWindow, captureCookies, getAllCookies, revealCookieValue, deleteCookie, clearCookies,
  resetCookieCache
} from './cookies.js'
import { registerUpdaterIpc } from './updater.js'
import { listEnvironments, createEnvironment, switchEnvironment, mirrorEnvironment, deleteEnvironment, renameEnvironment, ensureDefaultEnvironment } from './category-env.js'
import { captureScreenshot, getScreenshotPath, getScreenshotFileName, deleteScreenshot, captureBatch } from './screenshot.js'

let mainWindowRef = null
export function getMainWindow() { return mainWindowRef }
export function setMainWindow(w) { mainWindowRef = w }

function genId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
}

// 书签默认字段（所有创建入口共用）
const BM_DEFAULTS = {
  pinned: false,
  archived: false,
  recycled: false,
  recycledAt: null,
  readStatus: undefined,
  openCount: 0,
  lastOpenedAt: null
}

function safeHandle(channel, handler) {
  ipcMain.handle(channel, async (evt, ...args) => {
    try {
      return await handler(evt, ...args)
    } catch (e) {
      console.error('[ipc error]', channel, e)
      return { error: e.message || String(e) }
    }
  })
}

// URL 验证工具函数：只允许 http/https 协议，拒绝 javascript:、file: 等危险协议
function isValidHttpUrl(str) {
  if (typeof str !== 'string' || str.length === 0 || str.length > 4096) return false
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

function isValidId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 160
}

function isStringArray(value, maxLength = 1000) {
  return Array.isArray(value) && value.length <= maxLength && value.every(isValidId)
}

function isValidCategories(value) {
  return Array.isArray(value) && value.length <= 1000 && value.every((category) =>
    category && typeof category === 'object' && isValidId(category.id) &&
    typeof category.name === 'string' && category.name.length <= 200
  )
}

function isValidSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const limit = value.previewCacheLimitMB
  return limit === undefined || (Number.isFinite(limit) && limit >= 10 && limit <= 10240)
}

// bm:update 允许更新的字段白名单（禁止覆盖 id、createdAt 等关键字段）
const BM_UPDATE_ALLOWED_FIELDS = new Set([
  'url', 'title', 'description', 'categoryId', 'manualCategoryId', 'manualSet',
  'autoCategorySuggested', 'tags', 'notes', 'favicon', 'previewHash',
  'status', 'statusCheckedAt', 'geo', 'whois', 'pinned', 'archived',
  'recycled', 'recycledAt', 'readStatus', 'openCount', 'lastOpenedAt',
  'addedAt', 'order', '_isManual'
])

export function registerIpc() {
  // ---- 版本更新 ----
  registerUpdaterIpc()

  // ---- 书签 ----
  safeHandle('bm:list', async () => loadBookmarks())
  safeHandle('bm:save', async (_e, list) => {
    if (!Array.isArray(list) || list.length > 10000 || !list.every((bookmark) => bookmark && typeof bookmark === 'object' && isValidId(bookmark.id) && isValidHttpUrl(bookmark.url))) {
      return { error: '书签数据格式无效' }
    }
    const current = loadBookmarks()
    const currentById = new Map(current.map((bookmark) => [bookmark.id, bookmark]))
    const serverFields = ['favicon', 'screenshot', 'previewHash', 'geo', 'whois']
    const merged = list.map((bookmark) => {
      const existing = currentById.get(bookmark?.id)
      if (!existing) return bookmark
      const result = { ...existing, ...bookmark }
      for (const field of serverFields) {
        if (existing[field] != null && bookmark[field] !== existing[field]) result[field] = existing[field]
      }
      return result
    })
    saveBookmarks(merged)
    return true
  })

  safeHandle('bm:add', async (_e, bookmark) => {
    // URL 验证：拒绝 javascript:、file: 等非 http/https 协议
    if (!bookmark || !bookmark.url || !isValidHttpUrl(bookmark.url)) {
      return { error: '无效的 URL，仅允许 http/https 协议' }
    }
    const list = loadBookmarks()
    const bm = {
      id: genId('bm'),
      url: bookmark.url,
      title: bookmark.title || bookmark.url,
      description: bookmark.description || '',
      categoryId: bookmark.categoryId || null,
      manualCategoryId: bookmark.categoryId || null,
      manualSet: !!bookmark.manualSet,
      autoCategorySuggested: null,
      tags: bookmark.tags || [],
      notes: bookmark.notes || '',
      favicon: null,
      previewHash: null,
      status: 'unknown',
      statusCheckedAt: null,
      geo: null,
      whois: null,
      pinned: !!bookmark.pinned,
      archived: false,
      recycled: false,
      recycledAt: null,
      readStatus: bookmark.readStatus || undefined,
      openCount: 0,
      lastOpenedAt: null,
      createdAt: Date.now(),
      addedAt: Date.now()
    }
    list.push(bm)
    saveBookmarks(list)
    // 后台抓图标（原子更新，不重新加载整个列表）
    const addedId = bm.id
    const addedUrl = bm.url
    fetchFavicon(addedUrl).then((fname) => {
      if (fname) {
        const arr = loadBookmarks()
        const idx = arr.findIndex((x) => x.id === addedId)
        if (idx !== -1) { arr[idx].favicon = fname; saveBookmarks(arr) }
        send('bm:favicon-updated', { id: addedId, favicon: fname })
      }
    }).catch(() => {})
    // 后台抓网页截图（延迟 2 秒，避免与 favicon 抢占资源）
    setTimeout(() => {
      captureScreenshot(addedUrl).then((result) => {
        if (result.ok) {
          const arr = loadBookmarks()
          const idx = arr.findIndex((x) => x.id === addedId)
          if (idx !== -1) { arr[idx].screenshot = result.file; saveBookmarks(arr) }
          send('bm:screenshot-updated', { id: addedId, screenshot: result.file })
        }
      }).catch(() => {})
    }, 2000)
    return bm
  })

  safeHandle('bm:update', async (_e, id, patch) => {
    if (!isValidId(id) || !patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: '书签更新数据无效' }
    if (patch.url !== undefined && !isValidHttpUrl(patch.url)) return { error: '无效的 URL，仅允许 http/https 协议' }
    const list = loadBookmarks()
    const idx = list.findIndex((x) => x.id === id)
    if (idx === -1) return null
    // 字段白名单过滤：禁止覆盖 id、createdAt 等关键字段
    const cleanPatch = {}
    for (const key of Object.keys(patch || {})) {
      if (BM_UPDATE_ALLOWED_FIELDS.has(key)) {
        cleanPatch[key] = patch[key]
      }
    }
    const { _isManual, ...safePatch } = cleanPatch
    const urlChanged = safePatch.url && safePatch.url !== list[idx].url
    list[idx] = { ...list[idx], ...safePatch, updatedAt: Date.now() }
    // 若改动 categoryId 且明确是手动操作，则记录 manual
    if (safePatch.categoryId !== undefined && _isManual) {
      list[idx].manualCategoryId = patch.categoryId
      list[idx].manualSet = true
    }
    saveBookmarks(list)
    if (urlChanged) {
      // 重新抓图标
      fetchFavicon(patch.url).then((fname) => {
        if (fname) {
          const arr = loadBookmarks()
          const i = arr.findIndex((x) => x.id === id)
          if (i !== -1) { arr[i].favicon = fname; saveBookmarks(arr); send('bm:favicon-updated', { id, favicon: fname }) }
        }
      }).catch(() => {})
      // 重新抓截图
      captureScreenshot(patch.url).then((result) => {
        if (result.ok) {
          const arr = loadBookmarks()
          const i = arr.findIndex((x) => x.id === id)
          if (i !== -1) { arr[i].screenshot = result.file; saveBookmarks(arr); send('bm:screenshot-updated', { id, screenshot: result.file }) }
        }
      }).catch(() => {})
    }
    return list[idx]
  })

  safeHandle('bm:delete', async (_e, id) => {
    const list = loadBookmarks().filter((x) => x.id !== id)
    saveBookmarks(list)
    return true
  })

  // 批量更新书签（仅走白名单字段），用于批量移动分类等场景
  safeHandle('bm:updateBatch', async (_e, items) => {
    if (!Array.isArray(items) || items.length === 0) return { error: '批量更新数据无效', count: 0 }
    if (items.length > 5000) return { error: '单次批量更新不能超过 5000 条', count: 0 }
    const list = loadBookmarks()
    let count = 0
    const changedUrls = []
    for (const it of items) {
      if (!it || typeof it !== 'object') continue
      const { id, data } = it
      if (!isValidId(id) || !data || typeof data !== 'object' || Array.isArray(data)) continue
      const idx = list.findIndex((x) => x.id === id)
      if (idx === -1) continue
      const cleanPatch = {}
      for (const key of Object.keys(data)) {
        if (BM_UPDATE_ALLOWED_FIELDS.has(key)) cleanPatch[key] = data[key]
      }
      const { _isManual, ...safePatch } = cleanPatch
      const urlChanged = safePatch.url && safePatch.url !== list[idx].url
      if (safePatch.url !== undefined && !isValidHttpUrl(safePatch.url)) continue
      list[idx] = { ...list[idx], ...safePatch, updatedAt: Date.now() }
      if (safePatch.categoryId !== undefined && _isManual) {
        list[idx].manualCategoryId = data.categoryId
        list[idx].manualSet = true
      }
      if (urlChanged) changedUrls.push(safePatch.url)
      count++
    }
    if (count > 0) saveBookmarks(list)
    // URL 变化的批量重新抓图标/截图（每条独立异步）
    for (const url of changedUrls) {
      fetchFavicon(url).then((fname) => {
        if (!fname) return
        const arr = loadBookmarks()
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].url === url) {
            arr[i].favicon = fname
            send('bm:favicon-updated', { id: arr[i].id, favicon: fname })
            break
          }
        }
        saveBookmarks(arr)
      }).catch(() => {})
      captureScreenshot(url).then((result) => {
        if (!result.ok) return
        const arr = loadBookmarks()
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].url === url) {
            arr[i].screenshot = result.file
            send('bm:screenshot-updated', { id: arr[i].id, screenshot: result.file })
            break
          }
        }
        saveBookmarks(arr)
      }).catch(() => {})
    }
    return { count }
  })

  safeHandle('bm:removeDuplicates', async () => {
    const list = loadBookmarks()
    const seen = new Map()
    const toKeep = []
    let removed = 0
    for (const bm of list) {
      const key = (bm.url || '').trim().toLowerCase()
      if (seen.has(key)) { removed++ } else { seen.set(key, bm); toKeep.push(bm) }
    }
    saveBookmarks(toKeep)
    return { removed, kept: toKeep.length }
  })

  // 批量更新排序序号
  safeHandle('bm:reorder', async (_e, orders) => {
    // orders: [{ id, order }]
    const list = loadBookmarks()
    const map = new Map(orders.map(o => [o.id, o.order]))
    let changed = 0
    for (let i = 0; i < list.length; i++) {
      if (map.has(list[i].id)) {
        list[i].order = map.get(list[i].id)
        changed++
      }
    }
    if (changed > 0) saveBookmarks(list)
    return { changed }
  })

  // 生成二维码 DataURL（纯 Node.js，使用 Canvas 方案或 QR Server API）
  // 由于不引入额外依赖，使用内联 QR Code 生成（简化版）
  safeHandle('bm:qrcode', async (_e, text, size = 256) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > 2048 || !Number.isInteger(size) || size < 64 || size > 1024) {
      return { error: '二维码参数无效' }
    }
    try {
      // 使用 quickchart.io 的公共免费 API 生成（无 API key）
      const url = `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=${size}&margin=2`
      const r = await requestWithTimeout(url, { method: 'GET', timeout: 5000 })
      if (r.status === 200 && r.body && r.body.length > 0) {
        return { dataUrl: 'data:image/png;base64,' + r.body.toString('base64') }
      }
      return { error: '二维码生成失败' }
    } catch (e) {
      return { error: e.message || '生成失败' }
    }
  })

  safeHandle('bm:clearAll', async () => {
    saveBookmarks([])
    return { ok: true }
  })

  safeHandle('bm:deleteBatch', async (_e, ids) => {
    if (!isStringArray(ids)) return { error: '书签 ID 列表无效' }
    const set = new Set(ids)
    const list = loadBookmarks().filter((x) => !set.has(x.id))
    saveBookmarks(list)
    return true
  })

  // ---- 分类 ----
  safeHandle('cat:list', async () => loadCategories())
  safeHandle('cat:save', async (_e, cats) => {
    if (!isValidCategories(cats)) return { error: '分类数据格式无效' }
    saveCategories(cats)
    return true
  })

  // ---- 分类环境 ----
  safeHandle('env:list', async () => listEnvironments())
  safeHandle('env:create', async (_e, name, copyCurrent) => createEnvironment(name, copyCurrent))
  safeHandle('env:switch', async (_e, envId) => switchEnvironment(envId))
  safeHandle('env:mirror', async (_e, name) => mirrorEnvironment(name))
  safeHandle('env:delete', async (_e, envId) => deleteEnvironment(envId))
  safeHandle('env:rename', async (_e, envId, name) => renameEnvironment(envId, name))
  safeHandle('env:ensure', async () => ensureDefaultEnvironment())

  // ---- favicon ----
  safeHandle('favicon:fetch', async (_e, url) => fetchFavicon(url))
  safeHandle('favicon:path', async (_e, name) => {
    if (!name) return null
    return readAsDataUrl(path.join(FAVICONS_DIR, name))
  })

  // ---- 校验 ----
  safeHandle('validate:one', async (_e, url) => {
    if (!isValidHttpUrl(url)) return { status: 'dead', code: 0, message: '无效 URL', finalUrl: typeof url === 'string' ? url : '' }
    return validateUrl(url)
  })
  safeHandle('validate:batch', async (_e, urls) => {
    if (!Array.isArray(urls) || urls.length === 0) return []
    if (urls.length > 1000) return { error: '单次最多校验 1000 个书签' }
    const validUrls = urls.filter(isValidHttpUrl)
    if (validUrls.length === 0) return urls.map(() => ({ status: 'dead', code: 0, message: '无效 URL', finalUrl: '' }))
    // 若部分 URL 无效，先用占位结果初始化，只对有效 URL 校验
    if (validUrls.length < urls.length) {
      console.warn('[validate:batch]', urls.length - validUrls.length, '个无效 URL 将被标记为 dead')
    }
    const results = await validateBatch(validUrls, {
      limit: 3,
      onProgress: (done, total, currentUrl, result) => {
        send('validate:progress', { done, total, currentUrl, result })
      }
    })
    // 将结果映射回原始 urls 顺序（处理无效 URL 占位）
    const resultMap = new Map()
    validUrls.forEach((u, i) => resultMap.set(u, results[i]))
    return urls.map(u => {
      if (typeof u !== 'string' || !u.startsWith('http')) {
        return { status: 'dead', code: 0, message: '无效 URL', finalUrl: u || '' }
      }
      return resultMap.get(u) || { status: 'unknown', code: 0, message: '校验未完成', finalUrl: u }
    })
  })

  // ---- 预览 ----
  safeHandle('preview:generate', async (_e, url) => generatePreview(url))
  safeHandle('preview:get', async (_e, url) => getPreview(url))
  safeHandle('preview:image', async (_e, url) => {
    const name = previewImageName(url)
    if (!name) return null
    return readAsDataUrl(previewImagePath(name))
  })
  safeHandle('preview:batch', async (_e, urls) => {
    if (!Array.isArray(urls) || urls.length === 0) return { error: '预览 URL 列表为空' }
    // 单次 IPC 仍限制 5000（防止一次塞太多内存），超出会自动分批串行处理
    if (urls.length > 5000) {
      const all = []
      for (let i = 0; i < urls.length; i += 500) {
        send('preview:progress', { done: i, total: urls.length, currentUrl: '' })
        const batch = urls.slice(i, i + 500)
        const valid = batch.filter(isValidHttpUrl)
        if (valid.length === 0) continue
        const results = await generateBatch(valid, { limit: 4 })
        all.push(...results)
        send('preview:progress', { done: i + batch.length, total: urls.length, currentUrl: '' })
      }
      return all
    }
    const valid = urls.filter(isValidHttpUrl)
    const skipped = urls.length - valid.length
    if (valid.length === 0) return { error: '没有有效的 http/https URL 可预览', skipped }
    const results = await generateBatch(valid, {
      limit: 4,
      onProgress: (done, total, currentUrl) => send('preview:progress', { done, total, currentUrl })
    })
    return skipped > 0 ? { results, skipped } : results
  })
  safeHandle('preview:cacheSize', async () => {
    return { bytes: getImagesSize(), mb: +(getImagesSize() / 1024 / 1024).toFixed(2) }
  })
  safeHandle('preview:enforceLimit', async () => enforceCacheLimit())

  // ---- 网页截图 ----
  safeHandle('screenshot:capture', async (_e, url, options) => {
    const result = await captureScreenshot(url, options)
    if (result.ok) {
      // 更新书签的 screenshot 字段
      const arr = loadBookmarks()
      const idx = arr.findIndex((x) => x.url === url)
      if (idx !== -1) {
        arr[idx].screenshot = result.file
        saveBookmarks(arr)
        send('bm:screenshot-updated', { id: arr[idx].id, screenshot: result.file })
      }
    }
    return result
  })
  safeHandle('screenshot:get', async (_e, url) => {
    const p = getScreenshotPath(url)
    return p ? readAsDataUrl(p) : null
  })
  safeHandle('screenshot:batch', async (_e, urls) => {
    return captureBatch(urls, {
      limit: 2,
      onProgress: (done, total, currentUrl) => send('screenshot:progress', { done, total, currentUrl })
    })
  })
  safeHandle('screenshot:delete', async (_e, url) => {
    deleteScreenshot(url)
    return { ok: true }
  })

  // ---- GeoIP ----
  safeHandle('geo:lookup', async (_e, url) => lookupGeo(url))
  safeHandle('geo:ready', async () => isGeoipReady())

  // ---- WHOIS 域名查询 ----
  safeHandle('whois:lookup', async (_e, url) => lookupWhois(url))
  safeHandle('whois:ready', async () => isWhoisReady())

  // ---- 自动分类 ----
  safeHandle('classify:suggest', async (_e, bookmark) => suggestCategory(bookmark))
  safeHandle('classify:suggestBatch', async (_e, bookmarks) => suggestBatch(bookmarks))
  safeHandle('classify:apply', async (_e, bookmarks, opts) => {
    // 先自动存快照（名称含时间戳，方便区分）
    if (!Array.isArray(bookmarks)) {
      console.error('[classify:apply] bookmarks 不是数组:', typeof bookmarks, bookmarks)
      throw new Error('书签数据格式错误')
    }
    console.log('[classify:apply] 收到', bookmarks.length, '个书签，准备创建快照...')
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    // 创建快照（失败不阻塞分类，但记录日志）
    try {
      createSnapshot(bookmarks, { name: '自动分类前 ' + timeStr, kind: 'auto' })
      console.log('[classify:apply] 快照创建成功')
    } catch (e) {
      console.error('[classify:apply] 快照创建失败（继续分类）:', e.message)
      // 不重新抛出 — 快照创建失败不阻塞自动分类
    }
    const classified = applyAutoClassify(bookmarks, opts || {})
    saveBookmarks(classified)
    // 验证快照已写入
    const snaps = listSnapshots()
    console.log('[classify:apply] 完成，当前快照数:', snaps.length, '最新:', snaps[0]?.name)
    return classified
  })

  // ---- 快照 ----
  safeHandle('snap:list', async () => {
    const list = listSnapshots()
    console.log('[snap:list] 返回', list.length, '个快照')
    return list
  })
  safeHandle('snap:create', async (_e, bookmarks, opts) => {
    const snap = createSnapshot(bookmarks, opts || {})
    console.log('[snap:create] 快照已创建:', snap.name)
    return snap
  })
  safeHandle('snap:restore', async (_e, snapshotId) => {
    const list = loadBookmarks()
    const snaps = listSnapshots()
    const snap = snaps.find(s => s.id === snapshotId)
    console.log('[snap:restore] 恢复快照:', snap?.name, '(' + snapshotId + ')')
    const { bookmarks, restored } = restoreSnapshot(list, snapshotId)
    saveBookmarks(bookmarks)
    console.log('[snap:restore] 已恢复', restored, '个书签')
    return { restored }
  })
  safeHandle('snap:delete', async (_e, id) => {
    console.log('[snap:delete] 删除快照:', id)
    deleteSnapshot(id)
  })

  // ---- 浏览器 ----
  safeHandle('browser:open', async (_e, url) => {
    // URL 验证：只允许 http/https 协议，防止打开 javascript:、file: 等危险协议
    if (!url || typeof url !== 'string' || !isValidHttpUrl(url)) {
      return { error: '无效的 URL，仅允许 http/https 协议' }
    }
    return openInBrowser(url)
  })
  safeHandle('browser:detect', async () => detectBrowsers())

  // ---- 导入导出 ----
  safeHandle('io:detectBrowsers', async () => detectBrowserBookmarks())

  // 确保文件夹对应的分类存在（导入时使用）
  function ensureCategoryForFolder(folderPath, cats) {
    // 处理 "开发工具 / 前端 / React" 这种多级路径
    const parts = folderPath.split(' / ')
    let parentId = null
    let lastCatId = null
    for (const part of parts) {
      const existing = cats.find(c => c.name === part && c.parentId === parentId)
      if (existing) {
        lastCatId = existing.id
        parentId = existing.id
      } else {
        const newCat = {
          id: 'cat-import-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          name: part, icon: '📁', color: '#64748b',
          order: cats.length, parentId, tags: [],
          // 标记为导入来源：左窗分类树；不会被右窗的 manualTree 显示
          origin: 'imported',
          manual: false
        }
        cats.push(newCat)
        lastCatId = newCat.id
        parentId = newCat.id
      }
    }
    return lastCatId
  }

  safeHandle('io:importFromBrowser', async (_e, browserPath) => {
    // 路径白名单验证：只允许通过 detectBrowserBookmarks 检测到的路径
    const detected = detectBrowserBookmarks()
    const allowedPaths = new Set(detected.map(d => d.path))
    if (!browserPath || !allowedPaths.has(browserPath)) {
      return { error: '无效的浏览器书签路径，仅允许系统检测到的浏览器书签文件' }
    }
    const parsed = parseBrowserBookmarks(browserPath)
    const list = loadBookmarks()
    const cats = loadCategories()
    const existing = new Set(list.map((b) => b.url.toLowerCase().trim()))
    let added = 0, skipped = 0
    const batchSize = 50
    
    for (let i = 0; i < parsed.length; i += batchSize) {
      const batch = parsed.slice(i, i + batchSize)
      for (const p of batch) {
        const normalizedUrl = (p.url || '').toLowerCase().trim()
        if (!normalizedUrl || existing.has(normalizedUrl)) { skipped++; continue }
        existing.add(normalizedUrl)
        
        // 优先使用文件夹路径作为分类
        let catId = 'cat-other'
        if (p.folder) {
          catId = ensureCategoryForFolder(p.folder, cats)
        }
        if (catId === 'cat-other') {
          catId = suggestCategory({ url: p.url, title: p.title })
        }
        list.push({
          id: genId('bm'),
          url: p.url,
          title: p.title,
          description: '',
          categoryId: catId,
          manualCategoryId: catId,
          manualSet: false,
          autoCategorySuggested: catId,
          tags: [], notes: '',
          favicon: null, previewHash: null,
          status: 'unknown', statusCheckedAt: null, geo: null,
          createdAt: Date.now(),
          addedAt: p.addedAt || Date.now(),
          ...BM_DEFAULTS
        })
        added++
      }
      // 每批让出事件循环，防止UI卡死
      if (i + batchSize < parsed.length) {
        await new Promise(r => setTimeout(r, 0))
      }
    }
    saveBookmarks(list)
    saveCategories(cats)
    return { imported: added, parsed: parsed.length, skipped }
  })

  safeHandle('io:importHtml', async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      title: '导入浏览器书签',
      filters: [{ name: '书签 HTML', extensions: ['html', 'htm'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return { imported: 0, canceled: true }

    const filePath = res.filePaths[0]
    const stat = fs.statSync(filePath)
    if (stat.size > 50 * 1024 * 1024) {
      return { imported: 0, error: '文件过大（超过 50MB），请确认选择了正确的书签文件' }
    }

    let html
    try {
      html = fs.readFileSync(filePath, 'utf8')
    } catch (e) {
      const buf = fs.readFileSync(filePath)
      html = buf.toString('utf8')
    }
    // 启发式：若 UTF-8 解出大量 \uFFFD，说明原文件是 GB18030/GBK 等中文编码
    if (looksLikeWrongEncoding(html)) {
      const buf = fs.readFileSync(filePath)
      html = decodeAsGbk(buf)
    }
    // 移除 BOM
    if (html.charCodeAt(0) === 0xFEFF) html = html.slice(1)

    const parsed = parseBookmarksHtml(html)
    if (parsed.length === 0) return { imported: 0, parsed: 0, error: '该文件中未找到有效书签链接，请确认是浏览器导出的书签 HTML 文件' }

    const list = loadBookmarks()
    const existing = new Set(list.map((b) => b.url.toLowerCase().trim()))
    let added = 0, skipped = 0
    for (const p of parsed) {
      const normalizedUrl = (p.url || '').toLowerCase().trim()
      if (!normalizedUrl || existing.has(normalizedUrl)) { skipped++; continue }
      existing.add(normalizedUrl)
      const suggested = suggestCategory({ url: p.url, title: p.title })
      list.push({
        id: genId('bm'),
        url: p.url,
        title: p.title,
        description: '',
        categoryId: suggested,
        manualCategoryId: suggested,
        manualSet: false,
        autoCategorySuggested: suggested,
        tags: [], notes: '',
        favicon: null, previewHash: null,
        status: 'unknown', statusCheckedAt: null, geo: null, whois: null,
        createdAt: Date.now(),
        addedAt: p.addedAt || Date.now(),
        ...BM_DEFAULTS
      })
      added++
    }
    saveBookmarks(list)
    return { imported: added, parsed: parsed.length, skipped }
  })

  safeHandle('io:importCsv', async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      title: '导入 CSV 书签',
      filters: [{ name: 'CSV 文件', extensions: ['csv', 'txt'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return { imported: 0, canceled: true }

    let csvText
    try {
      const buf = fs.readFileSync(res.filePaths[0])
      csvText = buf.toString('utf8')
      if (looksLikeWrongEncoding(csvText)) {
        csvText = decodeAsGbk(buf)
      }
      if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1)
    } catch (e) {
      return { imported: 0, error: '文件读取失败: ' + (e.message || '') }
    }

    const { bookmarks: parsed } = parseCsv(csvText)
    if (parsed.length === 0) return { imported: 0, parsed: 0, error: '该 CSV 中未找到有效书签（需包含 url/link/href 列）' }

    const list = loadBookmarks()
    const existing = new Set(list.map((b) => b.url.toLowerCase().trim()))
    let added = 0, skipped = 0
    for (const p of parsed) {
      const normalizedUrl = (p.url || '').toLowerCase().trim()
      if (!normalizedUrl || existing.has(normalizedUrl)) { skipped++; continue }
      existing.add(normalizedUrl)
      const suggested = suggestCategory({ url: p.url, title: p.title })
      list.push({
        id: genId('bm'),
        url: p.url,
        title: p.title,
        description: p.description || '',
        categoryId: suggested,
        manualCategoryId: suggested,
        manualSet: false,
        autoCategorySuggested: suggested,
        tags: p.tags || [],
        notes: '',
        favicon: null, previewHash: null,
        status: 'unknown', statusCheckedAt: null, geo: null, whois: null,
        createdAt: Date.now(),
        addedAt: Date.now(),
        ...BM_DEFAULTS
      })
      added++
    }
    saveBookmarks(list)
    return { imported: added, parsed: parsed.length, skipped }
  })

  safeHandle('io:exportCategory', async (_e, categoryId) => {
    const allBookmarks = loadBookmarks()
    const allCats = loadCategories()
    // 递归收集所有子分类 ID
    const childIds = new Set([categoryId])
    function collectChildren(pid) {
      for (const c of allCats) {
        if (c.parentId === pid && !childIds.has(c.id)) {
          childIds.add(c.id)
          collectChildren(c.id)
        }
      }
    }
    collectChildren(categoryId)
    const filtered = allBookmarks.filter(b => childIds.has(b.categoryId))
    if (filtered.length === 0) return { exported: false, error: '该分类下没有书签' }
    const res = await dialog.showSaveDialog(getMainWindow(), {
      title: '导出分类书签文件夹',
      defaultPath: 'bookmarks-folder.html',
      filters: [{ name: '书签 HTML', extensions: ['html'] }]
    })
    if (res.canceled || !res.filePath) return { exported: false, canceled: true }
    const html = exportCategoryFolderHtml(categoryId, allCats, allBookmarks)
    fs.writeFileSync(res.filePath, html, 'utf8')
    return { exported: true, path: res.filePath, count: filtered.length }
  })

  safeHandle('io:exportHtml', async (_e) => {
    const res = await dialog.showSaveDialog(getMainWindow(), {
      title: '导出为 Chrome 书签',
      defaultPath: 'bookmarks.html',
      filters: [{ name: '书签 HTML', extensions: ['html'] }]
    })
    if (res.canceled || !res.filePath) return { exported: false, canceled: true }
    const html = exportBookmarksHtml(loadBookmarks(), loadCategories())
    fs.writeFileSync(res.filePath, html, 'utf8')
    return { exported: true, path: res.filePath }
  })

  safeHandle('io:exportJson', async () => {
    const res = await dialog.showSaveDialog(getMainWindow(), {
      title: '导出 JSON 备份',
      defaultPath: 'bookmark-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return { exported: false, canceled: true }
    const data = {
      version: 1,
      exportedAt: Date.now(),
      bookmarks: loadBookmarks(),
      categories: loadCategories()
    }
    fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), 'utf8')
    return { exported: true, path: res.filePath }
  })

  safeHandle('io:importJson', async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      title: '导入 JSON 备份',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return { imported: 0, canceled: true }
    let raw
    let data
    try {
      raw = fs.readFileSync(res.filePaths[0], 'utf8').replace(/^\uFEFF/, '')
      data = JSON.parse(raw)
      if (!data || typeof data !== 'object') throw new Error('根节点不是对象')
      if (!Array.isArray(data.bookmarks)) throw new Error('缺少 bookmarks 数组')
      if (data.categories !== undefined && !Array.isArray(data.categories)) throw new Error('categories 必须是数组')
    } catch (e) {
      return { imported: 0, error: 'JSON 文件读取或格式错误: ' + (e.message || '未知错误') }
    }

    const validBookmarks = data.bookmarks.reduce((result, bookmark) => {
      if (!bookmark || typeof bookmark !== 'object' || typeof bookmark.url !== 'string' || !isValidHttpUrl(bookmark.url)) return result
      result.push({
        ...bookmark,
        url: bookmark.url.trim(),
        title: typeof bookmark.title === 'string' ? bookmark.title : bookmark.url,
        description: typeof bookmark.description === 'string' ? bookmark.description : '',
        notes: typeof bookmark.notes === 'string' ? bookmark.notes : '',
        tags: Array.isArray(bookmark.tags) ? bookmark.tags.filter((tag) => typeof tag === 'string') : []
      })
      return result
    }, [])
    const skipped = data.bookmarks.length - validBookmarks.length
    if (validBookmarks.length === 0 && data.bookmarks.length > 0) {
      return { imported: 0, skipped, error: '备份中没有可导入的 http/https 书签' }
    }

    saveBookmarks(validBookmarks)
    if (Array.isArray(data.categories)) saveCategories(data.categories)
    return { imported: validBookmarks.length, categories: (data.categories || []).length, skipped }
  })

  safeHandle('io:exportStyledHtml', async () => {
    const res = await dialog.showSaveDialog(getMainWindow(), {
      title: '导出带样式网页',
      defaultPath: 'bookmarks.html',
      filters: [{ name: 'HTML 文件', extensions: ['html'] }]
    })
    if (res.canceled || !res.filePath) return { exported: false, canceled: true }
    fs.writeFileSync(res.filePath, exportStyledHtml(loadBookmarks(), loadCategories()), 'utf8')
    return { exported: true, path: res.filePath }
  })

  // ---- 导出为 Markdown ----
  safeHandle('io:exportMarkdown', async () => {
    const res = await dialog.showSaveDialog(getMainWindow(), {
      title: '导出 Markdown',
      defaultPath: 'bookmarks.md',
      filters: [{ name: 'Markdown 文件', extensions: ['md', 'markdown'] }]
    })
    if (res.canceled || !res.filePath) return { exported: false, canceled: true }
    fs.writeFileSync(res.filePath, exportMarkdown(loadBookmarks(), loadCategories()), 'utf8')
    return { exported: true, path: res.filePath }
  })

  // ---- Pocket CSV 导入 ----
  safeHandle('io:importPocketCsv', async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      title: '从 Pocket 导入 CSV',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return { imported: 0, canceled: true }

    const filePath = res.filePaths[0]
    let text
    try {
      text = fs.readFileSync(filePath, 'utf8')
    } catch (e) {
      return { imported: 0, error: '无法读取文件: ' + (e.message || '') }
    }
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

    const { bookmarks: parsed } = parsePocketCsv(text)
    if (parsed.length === 0) return { imported: 0, parsed: 0, error: '未在 CSV 中找到有效书签，请确认列包含 title 和 url' }

    const list = loadBookmarks()
    const existing = new Set(list.map((b) => b.url.toLowerCase().trim()))
    let added = 0, skipped = 0
    for (const p of parsed) {
      const normalizedUrl = (p.url || '').toLowerCase().trim()
      if (!normalizedUrl || existing.has(normalizedUrl)) { skipped++; continue }
      existing.add(normalizedUrl)
      const suggested = suggestCategory({ url: p.url, title: p.title })
      list.push({
        id: genId('bm'),
        url: p.url,
        title: p.title,
        description: p.description || '',
        categoryId: suggested,
        manualCategoryId: suggested,
        manualSet: false,
        autoCategorySuggested: suggested,
        tags: p.tags || [],
        notes: '',
        favicon: null, previewHash: null,
        status: 'unknown', statusCheckedAt: null, geo: null, whois: null,
        createdAt: Date.now(),
        addedAt: Date.now(),
        ...BM_DEFAULTS
      })
      added++
    }
    saveBookmarks(list)
    return { imported: added, parsed: parsed.length, skipped }
  })

  // ---- 设置 ----
  safeHandle('settings:get', async () => loadSettings())
  safeHandle('proxy:detect', async () => {
    const result = { found: false, host: '', port: '', type: 'http', source: '' }

    // 1. 检查环境变量
    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy
    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy
    const allProxy = process.env.ALL_PROXY || process.env.all_proxy
    const proxyUrl = httpProxy || httpsProxy || allProxy
    if (proxyUrl) {
      try {
        const u = new URL(proxyUrl)
        result.found = true
        result.host = u.hostname
        result.port = u.port || '8080'
        result.type = (u.protocol === 'socks5:' || u.protocol === 'socks:') ? 'socks5' : 'http'
        result.source = '环境变量'
        return result
      } catch { /* invalid URL */ }
    }

    // 2. Windows 注册表检测系统代理
    if (process.platform === 'win32') {
      try {
        const { execSync } = await import('node:child_process')
        const output = execSync(
          'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
          { encoding: 'utf-8', timeout: 3000 }
        )
        const enableMatch = output.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/)
        if (enableMatch && parseInt(enableMatch[1], 16) === 1) {
          const serverOutput = execSync(
            'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
            { encoding: 'utf-8', timeout: 3000 }
          )
          const serverMatch = serverOutput.match(/ProxyServer\s+REG_SZ\s+(.+)/)
          if (serverMatch) {
            let proxyStr = serverMatch[1].trim()
            let type = 'http'
            if (proxyStr.includes('=')) {
              const parts = proxyStr.split(';')
              const socksPart = parts.find(p => p.startsWith('socks='))
              const httpsPart = parts.find(p => p.startsWith('https='))
              const httpPart = parts.find(p => p.startsWith('http='))
              const chosen = socksPart || httpsPart || httpPart
              if (chosen) {
                proxyStr = chosen.split('=')[1]
                if (chosen.startsWith('socks')) type = 'socks5'
              }
            }
            const colonIdx = proxyStr.lastIndexOf(':')
            result.found = true
            result.host = colonIdx > 0 ? proxyStr.substring(0, colonIdx) : proxyStr
            result.port = colonIdx > 0 ? proxyStr.substring(colonIdx + 1) : '8080'
            result.type = type
            result.source = '系统代理'
            return result
          }
        }
      } catch { /* ignore */ }
    }

    return result
  })

  safeHandle('settings:save', async (_e, s) => {
    if (!isValidSettings(s)) return { error: '设置数据格式无效' }
    saveSettings(s)
    clearProxyCache()  // 设置变更时清除代理缓存
    console.log('[settings:save] written to', FILES.settings)
    return true
  })

  // ---- 数据目录 ----
  safeHandle('dataDir:get', async () => ({ current: getDataDir(), default: DEFAULT_DATA_DIR }))
  safeHandle('dataDir:pick', async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择数据存储目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths.length) return { canceled: true }
    return { path: res.filePaths[0] }
  })
  safeHandle('dataDir:set', async (_e, newPath) => {
    if (!newPath || newPath === getDataDir()) return { ok: true, path: getDataDir() }
    const ok = setDataDir(newPath)
    if (ok) {
      resetCredentialCache()
      resetCookieCache()
      saveDataDirPreference(getDataDir())
      saveSettings(loadSettings())
      return { ok: true, path: getDataDir() }
    }
    return { ok: false, error: '无法创建数据目录: ' + newPath }
  })
  safeHandle('dataDir:reset', async () => {
    setDataDir(DEFAULT_DATA_DIR)
    resetCredentialCache()
    resetCookieCache()
    saveDataDirPreference(DEFAULT_DATA_DIR)
    saveSettings(loadSettings())
    return { ok: true, path: getDataDir() }
  })

  // ---- GeoIP mmdb 导入 ----
  safeHandle('geoip:importMmdb', async (_e, kind /* 'city'|'asn' */) => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择 ' + (kind === 'asn' ? 'ASN' : 'City') + ' GeoLite2 数据库',
      filters: [{ name: 'MaxMind DB', extensions: ['mmdb'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return { imported: false }
    const src = res.filePaths[0]
    const destName = (kind === 'asn' ? 'GeoLite2-ASN.mmdb' : 'GeoLite2-City.mmdb')
    const dest = path.join(DATA_DIR, destName)
    fs.copyFileSync(src, dest)
    const settings = loadSettings()
    if (kind === 'asn') settings.geoip.asnMmdbPath = dest
    else settings.geoip.cityMmdbPath = dest
    saveSettings(settings)
    return { imported: true, path: dest }
  })

  // GeoIP 默认库下载
  safeHandle('geoip:downloadDb', async (_e, kind) => {
    try {
      const result = await downloadDb(kind, (progress) => {
        send('geoip:downloadProgress', { kind, ...progress })
      })
      return result
    } catch (e) {
      return { ok: false, error: e.message || '下载失败' }
    }
  })

  safeHandle('geoip:getDbInfo', async (_e, kind) => {
    if (kind) return getDbInfo(kind)
    return getAllDbInfo()
  })

  safeHandle('geoip:checkUpdate', async () => {
    return await checkDbUpdate()
  })

  safeHandle('geoip:deleteDb', async (_e, kind) => {
    return deleteDefaultDb(kind)
  })

  // ---- 凭证 ----
  safeHandle('cred:list', async () => getAllCredentials())
  safeHandle('cred:add', async (_e, host, data) => {
    // 校验 host：仅允许域名或 IP，禁止协议、路径、端口注入
    if (!host || typeof host !== 'string' || !/^[\w.-]{1,253}(:\d{1,5})?$/.test(host)) {
      return { error: '无效的主机名' }
    }
    return addCredential(host, data)
  })
  safeHandle('cred:update', async (_e, host, id, patch) => {
    const r = updateCredential(host, id, patch)
    return r ? { ...r, password: '' } : null
  })
  safeHandle('cred:delete', async (_e, host, id) => deleteCredential(host, id))
  safeHandle('cred:reveal', async (_e, host, id) => revealPassword(host, id))

  // ---- Cookie ----
  safeHandle('cookie:openLogin', async (_e, url) => {
    // URL 验证：仅允许 http/https，防止在登录窗口加载 file: 或其他危险协议
    if (!url || typeof url !== 'string' || !isValidHttpUrl(url)) {
      return { error: '无效的 URL，仅允许 http/https 协议' }
    }
    return openLoginWindow(url)
  })
  safeHandle('cookie:capture', async (_e, url) => captureCookies(url))
  safeHandle('cookie:list', async () => getAllCookies())
  safeHandle('cookie:reveal', async (_e, host, name) => revealCookieValue(host, name))
  safeHandle('cookie:delete', async (_e, host, name) => deleteCookie(host, name))
  safeHandle('cookie:clear', async (_e, host) => clearCookies(host))

  // ---- 通用 ----
  safeHandle('app:openDataDir', async () => {
    const { shell } = await import('electron')
    shell.openPath(DATA_DIR)
    return true
  })

  // 自动备份
  safeHandle('backup:create', async () => {
    try {
      const r = createBackupNow()
      return { ok: true, ...r }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  safeHandle('backup:list', async () => {
    return listBackups()
  })

  safeHandle('backup:start', async (_e, intervalMinutes) => {
    startAutoBackup(intervalMinutes)
    return { ok: true }
  })

  safeHandle('backup:stop', async () => {
    stopAutoBackup()
    return { ok: true }
  })

  // 多窗口预览
  safeHandle('previewWindow:create', async (_e, url, title) => {
    const { id } = createPreviewWindow(url, title)
    return { id }
  })

  safeHandle('previewWindow:close', async (_e, id) => {
    closePreviewWindow(id)
    return { ok: true }
  })

  safeHandle('previewWindow:list', async () => {
    return listPreviewWindows()
  })

  safeHandle('previewWindow:closeAll', async () => {
    closeAllPreviewWindows()
    return { ok: true }
  })

  safeHandle('previewWindow:focus', async (_e, id) => {
    focusPreviewWindow(id)
    return { ok: true }
  })

  // 插件系统
  safeHandle('plugin:loadAll', async () => {
    const loaded = loadAllPlugins()
    return { loaded: loaded.length }
  })

  safeHandle('plugin:unloadAll', async () => {
    unloadAllPlugins()
    return { ok: true }
  })

  safeHandle('plugin:list', async () => {
    return getPluginStatus()
  })

  safeHandle('plugin:scan', async () => {
    return scanPlugins()
  })

  safeHandle('plugin:load', async (_e, id) => {
    // id = folder name
    const manifests = scanPlugins()
    const m = manifests.find(x => x._id === id)
    if (!m) return { error: '插件未找到' }
    const p = loadPlugin(m)
    return p ? { ok: true, id: p.id } : { error: '加载失败' }
  })

  safeHandle('plugin:unload', async (_e, id) => {
    unloadPlugin(id)
    return { ok: true }
  })

  safeHandle('plugin:getSettings', async (_e, id) => {
    return { html: getPluginSettingsHtml(id) }
  })

  safeHandle('plugin:getTab', async (_e, id) => {
    return { html: getPluginTabHtml(id) }
  })
}

function send(channel, payload) {
  // 仅向主窗口发送事件，避免广播到锁屏/闪屏/预览窗口引发意外行为或数据泄露
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, payload) } catch { /* ignore */ }
  }
}

// 读取图片为 data url（避免 file:// 协议在渲染层 CSP 问题）
function readAsDataUrl(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const mime = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mime || 'png'};base64,${buf.toString('base64')}`
  } catch { return null }
}

// 启发式检测 UTF-8 解码是否失败（替换字符占比高 + 中文浏览器导出特征）
function looksLikeWrongEncoding(text) {
  if (!text) return false
  // 出现 U+FFFD 替换字符 -> 几乎肯定是编码错了
  let replacement = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0xFFFD) replacement++
    if (replacement >= 3) return true
  }
  return false
}

// 不依赖第三方库的内置 GBK/GB18030 解码（覆盖中文浏览器导出格式）
// 与 iconv-lite 行为一致，处理双字节高位 0x81-0xFE / 低位 0x40-0xFE
function decodeAsGbk(buf) {
  try {
    const TextDecoder = globalThis.TextDecoder
    // Node 18+ 提供 GB18030 解码器（GB18030 是 GBK 的超集，行为一致）
    if (TextDecoder) {
      try { return new TextDecoder('gb18030').decode(buf) } catch { /* fallthrough */ }
    }
  } catch { /* fallthrough */ }
  // 退而求其次：latin1，绝不抛
  try { return buf.toString('latin1') } catch { return '' }
}
