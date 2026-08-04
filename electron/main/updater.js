import { app, ipcMain, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { requestWithTimeout } from './http.js'
import { loadSettings } from './store.js'
import {
  compareVersions, extractFileNameFromUrl, isValidDownloadUrl,
  pickBestAsset, buildUpdateBatContent, calcProgress
} from './updater-logic.js'

// ============================================================
// GitHub 仓库配置
// ============================================================
const GITHUB_OWNER = 'Quantum-and-photon'
const GITHUB_REPO = 'bookmark-manager'
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

// ============================================================
// 暂存文件夹 —— 下载更新包到此目录，安装后自动清理
// ============================================================
const STAGING_DIR = path.join(app.getPath('temp'), 'bookmark-manager-update')

// ============================================================
// 更新状态机
// idle → checking → (available | not-available | error)
// available → downloading → downloaded → installing
// ============================================================
const STATE = {
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not-available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  INSTALLING: 'installing',
  ERROR: 'error'
}

let currentState = STATE.IDLE
let autoUpdater = null
let updateInfo = null
let downloadProgress = null
let lastError = ''
let silentDownloadEnabled = false
let retryCount = 0
const MAX_RETRIES = 3

// 自定义下载相关
let customDownloadReq = null
let downloadedFilePath = null
let isCancelling = false   // [FIX] 取消标志，防止重试覆盖状态
let downloadSessionId = 0  // [FIX] 下载会话 ID，区分不同下载周期

// ============================================================
// 工具函数
// ============================================================
function setState(newState, data) {
  currentState = newState
  notifyStateChange(data)
}

function notifyStateChange(data) {
  const payload = {
    state: currentState,
    updateInfo,
    downloadProgress,
    error: lastError,
    currentVersion: app.getVersion(),
    ...data
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:state-changed', payload)
    }
  }
}

function notifyProgress(prog) {
  downloadProgress = prog
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:progress', prog)
    }
  }
}

function isPortableBuild() {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const appUpdateYml = path.join(process.resourcesPath || __dirname, 'app-update.yml')
    return !fs.existsSync(appUpdateYml)
  } catch {
    return true
  }
}

function canUseAutoUpdater() {
  return !!autoUpdater && app.isPackaged && !isPortableBuild()
}

// ============================================================
// 暂存文件夹管理
// ============================================================
function ensureStagingDir() {
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true })
  }
  return STAGING_DIR
}

// 清理暂存文件夹（app 启动时调用）
export function cleanupStaging() {
  try {
    if (fs.existsSync(STAGING_DIR)) {
      const files = fs.readdirSync(STAGING_DIR)
      for (const f of files) {
        try { fs.unlinkSync(path.join(STAGING_DIR, f)) } catch { /* ignore */ }
      }
      try { fs.rmdirSync(STAGING_DIR) } catch { /* ignore */ }
      console.log('[updater] 暂存文件夹已清理:', STAGING_DIR)
    }
  } catch (e) {
    console.warn('[updater] 清理暂存文件夹失败:', e.message)
  }
}

// ============================================================
// electron-updater 加载
// ============================================================
async function loadAutoUpdater() {
  if (autoUpdater) return autoUpdater
  try {
    const mod = await import('electron-updater')
    autoUpdater = mod.autoUpdater
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowDowngrade = false

    autoUpdater.on('update-available', (info) => {
      updateInfo = {
        version: info.version,
        releaseDate: info.releaseDate || '',
        releaseNotes: typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : (Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map(n => n.note || '').join('\n')
            : ''),
        mode: 'auto-updater'
      }
      setState(STATE.AVAILABLE)
      handleSilentDownload()
    })

    autoUpdater.on('update-not-available', () => {
      updateInfo = null
      setState(STATE.NOT_AVAILABLE)
    })

    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err)
      if (currentState === STATE.DOWNLOADING && retryCount > 0) return
      lastError = err.message || String(err)
      setState(STATE.ERROR)
    })

    autoUpdater.on('download-progress', (progress) => {
      const speed = progress.bytesPerSecond || 0
      const remainingBytes = (progress.total || 0) - (progress.transferred || 0)
      const etaSeconds = speed > 0 ? Math.ceil(remainingBytes / speed) : 0
      notifyProgress({
        percent: Math.round(progress.percent || 0),
        transferred: progress.transferred || 0,
        total: progress.total || 0,
        bytesPerSecond: speed,
        eta: etaSeconds
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      notifyProgress({ percent: 100, transferred: 0, total: 0, eta: 0 })
      setState(STATE.DOWNLOADED, { version: info.version })
      import('./updater-window.js').then(({ getUpdaterWindow, createUpdaterWindow }) => {
        const win = getUpdaterWindow()
        if (!win || win.isDestroyed()) {
          createUpdaterWindow(false)
        } else {
          if (win.isMinimized()) win.restore()
          win.focus()
        }
      }).catch(() => {})
    })

    return autoUpdater
  } catch (e) {
    console.warn('[updater] electron-updater 不可用，使用 GitHub API 模式:', e.message)
    return null
  }
}

// ============================================================
// GitHub API 检查（portable / dev 模式）
// ============================================================
async function checkGithubReleases() {
  try {
    const resp = await requestWithTimeout(GITHUB_API_URL, {
      method: 'GET',
      timeout: 10000,
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'BookmarkManager-Updater'
      }
    })

    if (resp.status !== 200 || !resp.body) {
      lastError = `GitHub API 返回 ${resp.status}`
      setState(STATE.ERROR)
      return { error: lastError }
    }

    const release = JSON.parse(resp.body.toString())
    const latestVersion = (release.tag_name || '').replace(/^v/, '')
    const currentVersion = app.getVersion()
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

    const asset = pickBestAsset(release.assets)

    updateInfo = {
      version: latestVersion,
      releaseDate: release.published_at || '',
      releaseNotes: release.body || '',
      downloadUrl: asset.url,
      downloadSize: asset.size,
      htmlUrl: release.html_url || GITHUB_RELEASES_URL,
      mode: 'github-api'
    }

    if (hasUpdate) {
      setState(STATE.AVAILABLE)
      handleSilentDownload()
    } else {
      updateInfo = null
      setState(STATE.NOT_AVAILABLE)
    }

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseNotes: release.body || '',
      releaseDate: release.published_at || '',
      downloadUrl: asset.url,
      htmlUrl: release.html_url || GITHUB_RELEASES_URL,
      mode: 'github-api'
    }
  } catch (e) {
    lastError = e.message || 'GitHub API 请求失败'
    setState(STATE.ERROR)
    return { error: lastError }
  }
}

// ============================================================
// 静默下载处理
// ============================================================
async function handleSilentDownload() {
  if (!silentDownloadEnabled) return
  if (currentState !== STATE.AVAILABLE) return
  console.log('[updater] 静默下载已启用，自动开始下载…')
  await startDownload()
}

// ============================================================
// 自定义下载器 —— 流式下载到暂存文件夹，支持进度和取消
// [FIX] 使用 settled 标志防止双重 reject
// [FIX] 使用 sessionId 区分不同下载周期
// ============================================================
function downloadToStaging(url, fileName, sessionId) {
  return new Promise((resolve, reject) => {
    if (!isValidDownloadUrl(url)) {
      return reject(new Error('无效的下载 URL'))
    }

    ensureStagingDir()
    const destPath = path.join(STAGING_DIR, fileName)
    const tmpPath = destPath + '.tmp'
    const file = fs.createWriteStream(tmpPath)

    let totalBytes = 0
    let receivedBytes = 0
    let lastNotifyTime = 0
    let startTime = Date.now()
    let redirectCount = 0
    const MAX_REDIRECT = 5

    // [FIX] settled 标志：防止 reject/resolve 被多次调用
    let settled = false

    const safeResolve = (val) => {
      if (settled) return
      settled = true
      // [FIX] 下载完成后清理请求引用
      customDownloadReq = null
      resolve(val)
    }

    const safeReject = (err) => {
      if (settled) return
      settled = true
      // [FIX] reject 后清理请求引用
      customDownloadReq = null
      reject(err)
    }

    const cleanup = () => {
      try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
    }

    const doRequest = (reqUrl) => {
      let u
      try { u = new URL(reqUrl) } catch { return safeReject(new Error('无效的下载 URL')) }
      const lib = u.protocol === 'http:' ? http : https

      const req = lib.get(u, {
        headers: { 'User-Agent': 'BookmarkManager-Updater' },
        timeout: 30000
      }, (res) => {
        // 处理重定向
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < MAX_REDIRECT) {
          redirectCount++
          res.resume()
          const newUrl = new URL(res.headers.location, u).toString()
          return doRequest(newUrl)
        }

        if (res.statusCode !== 200) {
          // [FIX] 消费响应体，防止 socket 挂起
          res.resume()
          // [FIX] 先标记 settled 再操作文件，防止 file.close 回调触发二次 reject
          try { file.close() } catch { /* ignore */ }
          try { file.destroy() } catch { /* ignore */ }
          cleanup()
          return safeReject(new Error(`下载失败: HTTP ${res.statusCode}`))
        }

        totalBytes = parseInt(res.headers['content-length'] || 0)

        res.on('data', (chunk) => {
          receivedBytes += chunk.length
          const now = Date.now()
          if (now - lastNotifyTime > 200 || receivedBytes === totalBytes) {
            lastNotifyTime = now
            // [FIX] 使用纯函数计算进度
            notifyProgress(calcProgress(receivedBytes, totalBytes, now - startTime))
          }
        })

        res.pipe(file)

        file.on('finish', () => {
          file.close(() => {
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
              fs.renameSync(tmpPath, destPath)
            } catch {
              try {
                fs.copyFileSync(tmpPath, destPath)
                fs.unlinkSync(tmpPath)
              } catch (e2) {
                cleanup()
                return safeReject(new Error('保存文件失败: ' + e2.message))
              }
            }
            // [FIX] 只有当前会话才设置 downloadedFilePath
            if (sessionId === downloadSessionId) {
              downloadedFilePath = destPath
            }
            safeResolve({ ok: true, path: destPath, size: receivedBytes })
          })
        })

        file.on('error', (e) => {
          // [FIX] 先关闭文件流再清理，防止文件描述符泄漏
          try { file.close() } catch { /* file may already be closed */ }
          try { file.destroy() } catch { /* ignore */ }
          cleanup()
          safeReject(e)
        })
      })

      req.on('timeout', () => {
        req.destroy(new Error('下载超时（30秒无响应）'))
      })

      req.on('error', (e) => {
        // [FIX] 先关闭文件再清理，使用 safeReject 防止重复
        try { file.close() } catch { /* file may already be closed */ }
        cleanup()
        safeReject(e)
      })

      // 保存请求引用，用于取消（仅当前会话有效）
      if (sessionId === downloadSessionId) {
        customDownloadReq = req
      }
    }

    doRequest(url)
  })
}

// ============================================================
// 带重试的自定义下载
// [FIX] 检查 isCancelling 标志，取消时不进入重试
// ============================================================
async function downloadWithRetryCustom() {
  const sessionId = downloadSessionId
  try {
    const url = updateInfo.downloadUrl || updateInfo.portableUrl
    if (!url) throw new Error('没有可用的下载链接')

    const fallbackName = `BookmarkManager-${updateInfo.version}-portable.exe`
    const fileName = extractFileNameFromUrl(url, fallbackName)

    await downloadToStaging(url, fileName, sessionId)
    return { ok: true, mode: 'custom' }
  } catch (e) {
    // [FIX] 如果是用户主动取消，不进入重试，不覆盖 IDLE 状态
    if (isCancelling) {
      isCancelling = false
      return { ok: false, cancelled: true }
    }

    retryCount++
    if (retryCount <= MAX_RETRIES) {
      const delay = 2000 * Math.pow(2, retryCount - 1)
      lastError = `下载失败，${delay / 1000} 秒后自动重试（第 ${retryCount}/${MAX_RETRIES} 次）…`
      setState(STATE.ERROR)
      console.warn(`[updater] 下载失败，${delay}ms 后重试 (${retryCount}/${MAX_RETRIES}):`, e.message)
      await new Promise(resolve => setTimeout(resolve, delay))

      // [FIX] 重试前检查是否已取消或状态已变化
      if (isCancelling || currentState !== STATE.ERROR) {
        return { ok: false, cancelled: isCancelling }
      }

      setState(STATE.DOWNLOADING)
      return downloadWithRetryCustom()
    }
    lastError = `下载失败，已重试 ${MAX_RETRIES} 次：${e.message || e}`
    setState(STATE.ERROR)
    return { error: lastError }
  }
}

// ============================================================
// 公共 API
// ============================================================
export async function checkForUpdates(silent = false) {
  if (currentState === STATE.CHECKING || currentState === STATE.DOWNLOADING) {
    return getState()
  }
  lastError = ''  // [FIX] 清除旧错误信息
  setState(STATE.CHECKING)

  try {
    const settings = loadSettings()
    silentDownloadEnabled = !!settings.silentDownload
  } catch { /* ignore */ }

  try {
    if (canUseAutoUpdater()) {
      await autoUpdater.checkForUpdates()
    } else {
      await checkGithubReleases()
    }
  } catch (e) {
    await checkGithubReleases()
  }

  return getState()
}

// autoUpdater 模式带重试下载
// [FIX] 与 downloadWithRetryCustom 保持一致的取消检查
async function downloadWithRetryAuto() {
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true, mode: 'auto' }
  } catch (e) {
    // [FIX] 用户主动取消时不进入重试
    if (isCancelling) {
      isCancelling = false
      return { ok: false, cancelled: true }
    }

    retryCount++
    if (retryCount <= MAX_RETRIES) {
      const delay = 2000 * Math.pow(2, retryCount - 1)
      lastError = `下载失败，${delay / 1000} 秒后自动重试（第 ${retryCount}/${MAX_RETRIES} 次）…`
      setState(STATE.ERROR)
      console.warn(`[updater] 下载失败，${delay}ms 后重试 (${retryCount}/${MAX_RETRIES}):`, e.message)
      await new Promise(resolve => setTimeout(resolve, delay))

      // [FIX] 重试前检查是否已取消或状态已变化
      if (isCancelling || currentState !== STATE.ERROR) {
        return { ok: false, cancelled: isCancelling }
      }

      setState(STATE.DOWNLOADING)
      return downloadWithRetryAuto()
    }
    lastError = `下载失败，已重试 ${MAX_RETRIES} 次：${e.message || e}`
    setState(STATE.ERROR)
    return { error: lastError }
  }
}

export async function startDownload() {
  if (!updateInfo) return { error: '没有可用的更新' }
  if (currentState === STATE.DOWNLOADING) return { error: '正在下载中…' }

  retryCount = 0
  isCancelling = false         // [FIX] 重置取消标志
  downloadSessionId++           // [FIX] 新的下载会话
  downloadedFilePath = null     // [FIX] 重置下载文件路径
  downloadProgress = null       // [FIX] 重置进度，防止旧值残留
  lastError = ''                // [FIX] 清除旧错误信息

  // autoUpdater 模式（非 portable 安装版）
  if (canUseAutoUpdater()) {
    setState(STATE.DOWNLOADING)
    return downloadWithRetryAuto()
  }

  // portable / GitHub API 模式：应用内下载到暂存文件夹
  setState(STATE.DOWNLOADING)
  const result = await downloadWithRetryCustom()

  if (result.ok) {
    notifyProgress({ percent: 100, transferred: 0, total: 0, eta: 0 })
    setState(STATE.DOWNLOADED)

    // 下载完成后：如果更新窗口已关闭，自动重新打开并聚焦
    try {
      const { getUpdaterWindow, createUpdaterWindow } = await import('./updater-window.js')
      const win = getUpdaterWindow()
      if (!win || win.isDestroyed()) {
        createUpdaterWindow(false)
      } else {
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    } catch { /* ignore */ }
  }

  return result
}

// ============================================================
// 安装更新
// ============================================================
export async function installUpdate() {
  if (currentState !== STATE.DOWNLOADED) {
    return { error: '更新未就绪' }
  }

  try {
    setState(STATE.INSTALLING)

    // autoUpdater 模式
    if (canUseAutoUpdater()) {
      autoUpdater.quitAndInstall(false, true)
      return { ok: true }
    }

    // portable 模式：创建批处理脚本替换 exe 并重启
    if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
      throw new Error('下载文件不存在')
    }

    const currentExe = process.execPath

    // [FIX] 使用纯函数生成批处理脚本
    const batContent = buildUpdateBatContent({
      pid: process.pid,
      downloadedFilePath,
      currentExePath: currentExe,
      stagingDir: STAGING_DIR
    })

    const batPath = path.join(STAGING_DIR, 'update.bat')
    ensureStagingDir()
    fs.writeFileSync(batPath, batContent, { encoding: 'utf8' })

    // 启动批处理脚本（隐藏窗口）
    const { spawn } = await import('node:child_process')
    spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref()

    // 退出当前应用
    app.quit()
    return { ok: true }
  } catch (e) {
    lastError = e.message
    setState(STATE.ERROR)
    return { error: e.message }
  }
}

export function cancelDownload() {
  if (currentState === STATE.DOWNLOADING) {
    // [FIX] 设置取消标志，阻止重试逻辑覆盖状态
    isCancelling = true

    // 取消自定义下载请求
    if (customDownloadReq) {
      try { customDownloadReq.destroy() } catch { /* ignore */ }
      customDownloadReq = null
    }

    // 清理临时文件
    try {
      if (fs.existsSync(STAGING_DIR)) {
        const files = fs.readdirSync(STAGING_DIR)
        for (const f of files) {
          if (f.endsWith('.tmp')) {
            try { fs.unlinkSync(path.join(STAGING_DIR, f)) } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }

    // [FIX] 增加会话 ID，使正在进行的下载会话失效
    downloadSessionId++

    setState(STATE.IDLE)
    return { ok: true, message: '下载已取消' }
  }
  setState(STATE.IDLE)
  return { ok: true }
}

export function getState() {
  return {
    state: currentState,
    updateInfo,
    downloadProgress,
    error: lastError,
    currentVersion: app.getVersion(),
    canAutoUpdate: canUseAutoUpdater(),
    isPortable: isPortableBuild(),
    silentDownload: silentDownloadEnabled,
    downloadedFilePath
  }
}

export function isDownloading() {
  return currentState === STATE.DOWNLOADING
}

export function isDownloaded() {
  return currentState === STATE.DOWNLOADED
}

// ============================================================
// 初始化
// ============================================================
export async function initUpdater() {
  cleanupStaging()
  await loadAutoUpdater()
  try {
    const settings = loadSettings()
    silentDownloadEnabled = !!settings.silentDownload
  } catch { /* ignore */ }
  console.log('[updater] 初始化完成, 当前版本:', app.getVersion(),
    canUseAutoUpdater() ? '(autoUpdater 模式)' : '(GitHub API + 自定义下载模式)',
    '静默下载:', silentDownloadEnabled ? '开启' : '关闭')
}

// ============================================================
// IPC 注册
// ============================================================
export function registerUpdaterIpc() {
  ipcMain.handle('updater:check', async (_e, silent) => checkForUpdates(silent))
  ipcMain.handle('updater:download', async () => startDownload())
  ipcMain.handle('updater:install', async () => installUpdate())
  ipcMain.handle('updater:cancel', async () => cancelDownload())
  ipcMain.handle('updater:getState', async () => getState())
  ipcMain.handle('updater:version', async () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    isPortable: isPortableBuild(),
    hasAutoUpdater: !!autoUpdater,
    canAutoUpdate: canUseAutoUpdater()
  }))
  ipcMain.handle('updater:openReleases', async () => {
    await shell.openExternal(GITHUB_RELEASES_URL)
    return { ok: true }
  })
}
