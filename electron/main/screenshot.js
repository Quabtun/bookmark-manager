import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { BrowserWindow } from 'electron'
import { IMAGES_DIR, PREVIEWS_DIR } from './store.js'

function hashOf(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

// 截图文件名：shot-{hash}.png
function screenshotFileName(url) {
  return 'shot-' + hashOf(url) + '.png'
}

// 截图元数据路径：与 preview 共用 PREVIEWS_DIR
function screenshotMetaPath(url) {
  return path.join(PREVIEWS_DIR, 'shot-' + hashOf(url) + '.json')
}

// ============================================================
// 捕获网页截图
// 使用隐藏 BrowserWindow 加载页面，等待渲染后截图
// ============================================================
export async function captureScreenshot(url, options = {}) {
  const {
    width = 1280,
    height = 800,
    waitMs = 3000,       // 页面加载后额外等待时间（让动态内容渲染）
    timeout = 20000,     // 整体超时
    thumbnail = true     // 是否生成缩略图
  } = options

  const fileName = screenshotFileName(url)
  const fullPath = path.join(IMAGES_DIR, fileName)

  // 已存在则直接返回缓存
  if (fs.existsSync(fullPath)) {
    return { ok: true, file: fileName, cached: true }
  }

  let win = null
  try {
    win = new BrowserWindow({
      width,
      height,
      show: false,
      webPreferences: {
        offscreen: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        images: true,
        backgroundThrottling: false
      }
    })

    // 设置 User-Agent，避免部分网站返回精简版
    await win.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    // 加载页面，带超时
    const loadResult = await Promise.race([
      win.loadURL(url, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('页面加载超时')), timeout))
    ]).catch(e => ({ error: e }))

    if (loadResult && loadResult.error) {
      throw loadResult.error
    }

    // 额外等待动态内容渲染
    await new Promise(r => setTimeout(r, waitMs))

    // 截取可视区域
    const image = await win.webContents.capturePage()

    // 保存原图
    fs.mkdirSync(IMAGES_DIR, { recursive: true })
    fs.writeFileSync(fullPath, image.toPNG())

    // 写入元数据
    const meta = {
      hash: hashOf(url),
      url,
      file: fileName,
      width,
      height,
      capturedAt: Date.now()
    }
    fs.writeFileSync(screenshotMetaPath(url), JSON.stringify(meta, null, 2))

    return { ok: true, file: fileName, cached: false }
  } catch (e) {
    console.warn('[screenshot] 捕获失败:', url, e.message)
    return { ok: false, error: e.message }
  } finally {
    // 确保窗口被销毁，防止内存泄漏
    if (win && !win.isDestroyed()) {
      try { win.destroy() } catch { /* ignore */ }
    }
  }
}

// ============================================================
// 获取截图文件路径
// ============================================================
export function getScreenshotPath(url) {
  const fileName = screenshotFileName(url)
  const fullPath = path.join(IMAGES_DIR, fileName)
  if (!fs.existsSync(fullPath)) return null
  return fullPath
}

// ============================================================
// 获取截图文件名
// ============================================================
export function getScreenshotFileName(url) {
  const fileName = screenshotFileName(url)
  const fullPath = path.join(IMAGES_DIR, fileName)
  return fs.existsSync(fullPath) ? fileName : null
}

// ============================================================
// 删除截图
// ============================================================
export function deleteScreenshot(url) {
  const fileName = screenshotFileName(url)
  const fullPath = path.join(IMAGES_DIR, fileName)
  const metaPath = screenshotMetaPath(url)
  try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath) } catch { /* ignore */ }
  try { if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath) } catch { /* ignore */ }
}

// ============================================================
// 批量截图
// ============================================================
export async function captureBatch(urls, { limit = 2, onProgress } = {}) {
  let done = 0
  const total = urls.length
  const results = []
  const queue = [...urls]

  const workers = Array.from({ length: Math.min(limit, urls.length) }, async () => {
    while (queue.length) {
      const url = queue.shift()
      try {
        const result = await captureScreenshot(url)
        results.push({ url, ...result })
      } catch (e) {
        results.push({ url, ok: false, error: e.message })
      }
      done++
      onProgress && onProgress(done, total, url)
    }
  })

  await Promise.all(workers)
  return results
}
