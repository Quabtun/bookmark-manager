import { app, ipcMain, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requestWithTimeout } from './http.js'
import { loadSettings } from './store.js'

// ============================================================
// GitHub 仓库配置 —— 请修改为你的实际仓库地址
// ============================================================
const GITHUB_OWNER = 'Quantum-and-photon'
const GITHUB_REPO = 'bookmark-manager'
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

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
let updateInfo = null        // { version, releaseDate, releaseNotes, downloadUrl, ... }
let downloadProgress = null  // { percent, transferred, total, bytesPerSecond }
let lastError = ''
let silentDownloadEnabled = false
let downloadStartTime = 0
let retryCount = 0
const MAX_RETRIES = 3

// ============================================================
// 工具函数
// ============================================================
function compareVersions(v1, v2) {
  const parts1 = v1.replace(/^v/, '').split('.').map(n => parseInt(n) || 0)
  const parts2 = v2.replace(/^v/, '').split('.').map(n => parseInt(n) || 0)
  const len = Math.max(parts1.length, parts2.length)
  for (let i = 0; i < len; i++) {
    const a = parts1[i] || 0
    const b = parts2[i] || 0
    if (a < b) return -1
    if (a > b) return 1
  }
  return 0
}

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
  // 通知所有窗口（包括更新窗口和主窗口）
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:state-changed', payload)
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
      // 下载中由 downloadWithRetry 处理错误，避免覆盖重试状态
      if (currentState === STATE.DOWNLOADING && retryCount > 0) return
      lastError = err.message || String(err)
      setState(STATE.ERROR)
    })

    autoUpdater.on('download-progress', (progress) => {
      const speed = progress.bytesPerSecond || 0
      const remainingBytes = (progress.total || 0) - (progress.transferred || 0)
      const etaSeconds = speed > 0 ? Math.ceil(remainingBytes / speed) : 0
      downloadProgress = {
        percent: Math.round(progress.percent || 0),
        transferred: progress.transferred || 0,
        total: progress.total || 0,
        bytesPerSecond: speed,
        eta: etaSeconds
      }
      // 下载中频繁通知进度（不改 state）
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('updater:progress', downloadProgress)
        }
      }
    })

    autoUpdater.on('update-downloaded', (info) => {
      downloadProgress = { percent: 100, transferred: 0, total: 0, eta: 0 }
      setState(STATE.DOWNLOADED, { version: info.version })
      // 下载完成后：如果更新窗口已关闭，自动重新打开并聚焦
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

    let installerUrl = null
    let portableUrl = null
    if (Array.isArray(release.assets)) {
      for (const asset of release.assets) {
        const name = (asset.name || '').toLowerCase()
        if (name.endsWith('.exe') && name.includes('setup') && !installerUrl) {
          installerUrl = asset.browser_download_url
        }
        if (name.endsWith('.exe') && name.includes('portable') && !portableUrl) {
          portableUrl = asset.browser_download_url
        }
      }
      if (!installerUrl) {
        const exe = release.assets.find(a =>
          (a.name || '').toLowerCase().endsWith('.exe') &&
          !(a.name || '').toLowerCase().includes('portable')
        )
        if (exe) installerUrl = exe.browser_download_url
      }
    }

    updateInfo = {
      version: latestVersion,
      releaseDate: release.published_at || '',
      releaseNotes: release.body || '',
      downloadUrl: installerUrl || portableUrl,
      portableUrl,
      installerUrl,
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
      downloadUrl: installerUrl || portableUrl,
      portableUrl,
      installerUrl,
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
  // GitHub API 模式无法静默下载（需要浏览器），仅 autoUpdater 模式支持
  if (!canUseAutoUpdater()) return
  console.log('[updater] 静默下载已启用，自动开始下载…')
  await startDownload()
}

// ============================================================
// 公共 API
// ============================================================
export async function checkForUpdates(silent = false) {
  if (currentState === STATE.CHECKING || currentState === STATE.DOWNLOADING) {
    return getState()
  }
  setState(STATE.CHECKING)

  // 读取静默下载设置
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
    // 回退到 GitHub API
    await checkGithubReleases()
  }

  return getState()
}

// ============================================================
// 带自动重试的下载
// ============================================================
async function downloadWithRetry() {
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true, mode: 'auto' }
  } catch (e) {
    retryCount++
    if (retryCount <= MAX_RETRIES) {
      const delay = 2000 * Math.pow(2, retryCount - 1) // 2s → 4s → 8s 指数退避
      lastError = `下载失败，${delay / 1000} 秒后自动重试（第 ${retryCount}/${MAX_RETRIES} 次）…`
      setState(STATE.ERROR)
      console.warn(`[updater] 下载失败，${delay}ms 后重试 (${retryCount}/${MAX_RETRIES}):`, e.message)
      await new Promise(resolve => setTimeout(resolve, delay))
      setState(STATE.DOWNLOADING)
      return downloadWithRetry()
    }
    lastError = `下载失败，已重试 ${MAX_RETRIES} 次：${e.message || e}`
    setState(STATE.ERROR)
    return { error: lastError }
  }
}

export async function startDownload() {
  if (!updateInfo) return { error: '没有可用的更新' }
  if (currentState === STATE.DOWNLOADING) return { error: '正在下载中…' }

  // GitHub API 模式：打开浏览器下载
  if (!canUseAutoUpdater()) {
    if (updateInfo.downloadUrl) {
      await shell.openExternal(updateInfo.downloadUrl)
      return { ok: true, mode: 'browser' }
    }
    if (updateInfo.htmlUrl) {
      await shell.openExternal(updateInfo.htmlUrl)
      return { ok: true, mode: 'browser' }
    }
    return { error: '没有可用的下载链接' }
  }

  // autoUpdater 模式：应用内下载（带自动重试）
  downloadStartTime = Date.now()
  retryCount = 0
  setState(STATE.DOWNLOADING)
  return downloadWithRetry()
}

export async function installUpdate() {
  if (currentState !== STATE.DOWNLOADED || !canUseAutoUpdater()) {
    return { error: '更新未就绪' }
  }
  try {
    setState(STATE.INSTALLING)
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  } catch (e) {
    lastError = e.message
    setState(STATE.ERROR)
    return { error: e.message }
  }
}

export function cancelDownload() {
  // electron-updater 不支持取消下载，但可以重置状态
  // GitHub API 模式没有下载状态需要取消
  if (currentState === STATE.DOWNLOADING) {
    // 无法真正取消 autoUpdater 下载，但允许用户关闭窗口
    // 下载会在后台继续，完成后通知
    return { ok: true, message: '下载将在后台继续' }
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
    silentDownload: silentDownloadEnabled
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
  await loadAutoUpdater()
  // 读取静默下载设置
  try {
    const settings = loadSettings()
    silentDownloadEnabled = !!settings.silentDownload
  } catch { /* ignore */ }
  console.log('[updater] 初始化完成, 当前版本:', app.getVersion(),
    canUseAutoUpdater() ? '(autoUpdater 模式)' : '(GitHub API 模式)',
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
