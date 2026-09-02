import { app, ipcMain, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requestWithTimeout, downloadToStream } from './http.js'
import { loadSettings } from './store.js'
import {
  compareVersions, extractFileNameFromUrl, isValidDownloadUrl,
  pickBestAsset
} from './updater-logic.js'
import { findDeltaAsset, isDeltaWorthIt } from './delta-logic.js'
import { performDeltaUpdate } from './delta-updater.js'

// ============================================================
// GitHub 仓库配置
// ============================================================
const GITHUB_OWNER = 'Quabtun'
const GITHUB_REPO = 'bookmark-manager-releases'
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
const GITHUB_API_LATEST = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const GITHUB_API_LIST = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=10`

// ============================================================
// 暂存文件夹 —— 下载更新包到此目录，安装后自动清理
// ============================================================
const STAGING_DIR = path.join(app.getPath('temp'), 'bookmark-manager-update')

// ============================================================
// 更新状态机
// idle → checking → (available | not-available | error)
// available → delta-downloading → delta-applying → downloaded → installing
//          → (fallback) downloading → downloaded → installing
// ============================================================
const STATE = {
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not-available',
  DOWNLOADING: 'downloading',
  DELTA_DOWNLOADING: 'delta-downloading',
  DELTA_APPLYING: 'delta-applying',
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

// 安装相关
let _installDone = false  // 安装完成标志，允许 app.quit() 通过 before-quit

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

// 发送安装进度到更新窗口
function notifyInstallProgress(prog) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win._isUpdaterWindow) {
      win.webContents.send('updater:install-progress', prog)
    }
  }
}

// 获取主窗口（非更新窗口）
function getMainWindowRef() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win._isUpdaterWindow && !win.isDestroyed()) {
      return win
    }
  }
  return null
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

    // [FIX] 配置代理给 electron-updater（安装版模式），让检查和下载都走代理
    try {
      const settings = loadSettings()
      if (settings.proxy && settings.proxy.enabled && settings.proxy.host) {
        const proto = settings.proxy.type === 'socks5' ? 'socks5' : 'http'
        const auth = settings.proxy.username
          ? encodeURIComponent(settings.proxy.username) + ':' + encodeURIComponent(settings.proxy.password) + '@'
          : ''
        autoUpdater.proxy = proto + '://' + auth + settings.proxy.host + ':' + settings.proxy.port
        console.log('[updater] electron-updater 已配置代理:', settings.proxy.host + ':' + settings.proxy.port, '(' + proto + ')')
      }
    } catch (e) {
      console.warn('[updater] 配置 electron-updater 代理失败:', e.message)
    }

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
    // [FIX] 优先用 /releases 列表接口（包含 prerelease，CDN 缓存更短）
    // 回退到 /releases/latest（仅非 prerelease，缓存更久）
    let release = null
    try {
      const listResp = await requestWithTimeout(GITHUB_API_LIST, {
        method: 'GET',
        timeout: 10000,
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'BookmarkManager-Updater'
        }
      })
      if (listResp.status === 200 && listResp.body) {
        const releases = JSON.parse(listResp.body.toString())
        if (Array.isArray(releases) && releases.length > 0) {
          // 取第一个非 draft 的 release（列表已按 created_at 降序排列）
          release = releases.find(r => !r.draft) || releases[0]
        }
      }
    } catch (e) {
      console.warn('[updater] /releases 列表请求失败，回退到 /releases/latest:', e.message)
    }

    if (!release) {
      const resp = await requestWithTimeout(GITHUB_API_LATEST, {
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
      release = JSON.parse(resp.body.toString())
    }

    const latestVersion = (release.tag_name || '').replace(/^v/, '')
    const currentVersion = app.getVersion()
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

    const asset = pickBestAsset(release.assets)
    if (!asset.url) {
      lastError = '该 GitHub Release 未包含可下载的 Windows 安装包'
      setState(STATE.ERROR)
      return { error: lastError }
    }

    // [FIX] 禁用差分更新：没有生成 delta 文件，检测逻辑增加复杂度且可能误匹配
    const deltaAsset = null
    const useDelta = false

    updateInfo = {
      version: latestVersion,
      releaseDate: release.published_at || '',
      releaseNotes: release.body || '',
      downloadUrl: asset.url,
      downloadSize: asset.size,
      deltaUrl: deltaAsset ? deltaAsset.url : null,
      deltaSize: deltaAsset ? deltaAsset.size : 0,
      useDelta,
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
// [FIX] 使用 downloadToStream 走代理（HTTP/SOCKS5），解决更新包下载绕过代理的问题
// [FIX] 使用 settled 标志防止双重 reject
// [FIX] 使用 sessionId 区分不同下载周期
// ============================================================
function downloadToStaging(url, fileName, sessionId) {
  return new Promise((resolve, reject) => {
    if (!isValidDownloadUrl(url)) {
      return reject(new Error('无效的下载 URL'))
    }

    console.log('[updater] 开始下载更新包:', url)
    console.log('[updater] 暂存路径:', STAGING_DIR)

    ensureStagingDir()
    const destPath = path.join(STAGING_DIR, fileName)
    const tmpPath = destPath + '.tmp'
    const file = fs.createWriteStream(tmpPath, { highWaterMark: 1024 * 1024 })

    let startTime = Date.now()
    let lastReceivedBytes = 0
    let lastSpeedTime = Date.now()
    let lastSpeed = 0  // 保存上一次瞬时速度

    // [FIX] settled 标志：防止 reject/resolve 被多次调用
    let settled = false

    const safeResolve = (val) => {
      if (settled) return
      settled = true
      customDownloadReq = null
      resolve(val)
    }

    const safeReject = (err) => {
      if (settled) return
      settled = true
      customDownloadReq = null
      // 取消时关闭并清理文件流
      try { file.destroy() } catch { /* ignore */ }
      try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
      reject(err)
    }

    // 进度回调：使用瞬时速度而非全局平均速度
    const onProgress = ({ receivedBytes, totalBytes }) => {
      const now = Date.now()
      const dt = (now - lastSpeedTime) / 1000
      if (dt > 0.3) {  // 至少 300ms 计算一次瞬时速度
        lastSpeed = (receivedBytes - lastReceivedBytes) / dt
        lastReceivedBytes = receivedBytes
        lastSpeedTime = now
      }
      // 使用瞬时速度，避免全局平均速度被连接建立时间拉低
      const remainingBytes = totalBytes - receivedBytes
      const eta = lastSpeed > 0 ? Math.ceil(remainingBytes / lastSpeed) : 0
      notifyProgress({
        percent: totalBytes > 0 ? Math.min(100, Math.round(receivedBytes / totalBytes * 100)) : 0,
        transferred: receivedBytes,
        total: totalBytes,
        bytesPerSecond: Math.round(lastSpeed),
        eta
      })
    }

    // onRequest 回调：保存当前请求引用用于取消（仅当前会话有效）
    const onRequest = (req) => {
      if (sessionId === downloadSessionId) {
        customDownloadReq = req
      }
    }

    downloadToStream(url, file, {
      onProgress,
      timeout: 30000,
      headers: { 'Accept': 'application/octet-stream' },
      onRequest
    }).then((result) => {
      // 下载完成，关闭文件流后重命名
      file.close(() => {
        // [FIX] 验证下载文件大小
        const actualSize = fs.statSync(tmpPath).size
        const expectedSize = updateInfo?.downloadSize || 0
        if (expectedSize > 0 && actualSize !== expectedSize) {
          try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
          console.error(`[updater] 下载文件大小不匹配: 期望 ${expectedSize}, 实际 ${actualSize}`)
          return safeReject(new Error(`下载文件大小不匹配: 期望 ${expectedSize} 字节, 实际 ${actualSize} 字节`))
        }
        console.log(`[updater] 下载完成，文件大小验证通过: ${actualSize} 字节`)

        try {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
          fs.renameSync(tmpPath, destPath)
        } catch {
          try {
            fs.copyFileSync(tmpPath, destPath)
            fs.unlinkSync(tmpPath)
          } catch (e2) {
            try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
            return safeReject(new Error('保存文件失败: ' + e2.message))
          }
        }
        // [FIX] 只有当前会话才设置 downloadedFilePath
        if (sessionId === downloadSessionId) {
          downloadedFilePath = destPath
        }
        safeResolve({ ok: true, path: destPath, size: result.receivedBytes })
      })
    }).catch(safeReject)
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
  if (currentState === STATE.CHECKING ||
      currentState === STATE.DOWNLOADING ||
      currentState === STATE.DELTA_DOWNLOADING ||
      currentState === STATE.DELTA_APPLYING) {
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

// ============================================================
// 差分更新尝试 —— 下载 delta → 读取本地 exe → 应用差分 → 校验
// 成功返回 { ok, mode: 'delta', size }
// 失败返回 { ok: false, error }，调用方应回退完整下载
// ============================================================
async function tryDeltaUpdate() {
  const sessionId = downloadSessionId
  const fallbackName = `BookmarkManager-${updateInfo.version}-portable.exe`

  setState(STATE.DELTA_DOWNLOADING)

  // 差分下载的瞬时速度计算
  let deltaLastBytes = 0
  let deltaLastTime = Date.now()
  let deltaSpeed = 0

  try {
    const result = await performDeltaUpdate({
      deltaUrl: updateInfo.deltaUrl,
      deltaSize: updateInfo.deltaSize,
      exePath: process.execPath,
      stagingDir: STAGING_DIR,
      destFileName: fallbackName,
      onDownloadProgress: ({ receivedBytes, totalBytes }) => {
        if (sessionId !== downloadSessionId) return
        const now = Date.now()
        const dt = (now - deltaLastTime) / 1000
        if (dt > 0.3) {
          deltaSpeed = (receivedBytes - deltaLastBytes) / dt
          deltaLastBytes = receivedBytes
          deltaLastTime = now
        }
        const remaining = totalBytes - receivedBytes
        const eta = deltaSpeed > 0 ? Math.ceil(remaining / deltaSpeed) : 0
        notifyProgress({
          percent: totalBytes > 0 ? Math.min(100, Math.round(receivedBytes / totalBytes * 100)) : 0,
          transferred: receivedBytes,
          total: totalBytes,
          bytesPerSecond: Math.round(deltaSpeed),
          eta
        })
      },
      onApplyProgress: ({ phase, message }) => {
        if (sessionId !== downloadSessionId) return
        setState(STATE.DELTA_APPLYING, { applyPhase: phase, applyMessage: message })
      },
      onRequest: (req) => {
        if (sessionId === downloadSessionId) {
          customDownloadReq = req
        }
      }
    })

    if (result.ok && sessionId === downloadSessionId) {
      downloadedFilePath = result.path
      return { ok: true, mode: 'delta', size: result.size }
    }

    return { ok: false, error: result.error || '差分更新未完成' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ============================================================
// 下载完成后聚焦/重新打开更新窗口
// ============================================================
async function focusUpdaterWindow() {
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

export async function startDownload() {
  if (!updateInfo) return { error: '没有可用的更新' }
  if (currentState === STATE.DOWNLOADING ||
      currentState === STATE.DELTA_DOWNLOADING ||
      currentState === STATE.DELTA_APPLYING) {
    return { error: '正在下载中…' }
  }

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

  // 差分更新路径（仅 portable 打包模式）
  if (updateInfo.useDelta && updateInfo.deltaUrl && app.isPackaged) {
    const deltaResult = await tryDeltaUpdate()

    if (deltaResult.ok) {
      notifyProgress({ percent: 100, transferred: 0, total: 0, eta: 0 })
      setState(STATE.DOWNLOADED)
      await focusUpdaterWindow()
      return deltaResult
    }

    // 差分失败，检查是否为用户取消
    if (isCancelling) {
      isCancelling = false
      return { ok: false, cancelled: true }
    }

    // 回退到完整下载
    console.warn('[updater] 差分更新失败，回退到完整下载:', deltaResult.error)
    lastError = ''
    retryCount = 0  // 重置重试计数给完整下载用
    downloadSessionId++  // 新会话，避免差分阶段的回调干扰
    downloadProgress = null
  }

  // 完整下载路径（portable / GitHub API 模式）
  setState(STATE.DOWNLOADING)
  const result = await downloadWithRetryCustom()

  if (result.ok) {
    notifyProgress({ percent: 100, transferred: 0, total: 0, eta: 0 })
    setState(STATE.DOWNLOADED)
    await focusUpdaterWindow()
  }

  return result
}

// ============================================================
// 安装更新 —— 混合模式：先尝试进程内安装（有进度），失败回退外部脚本
// [FIX] 释放单实例锁，确保新版本能正常启动
// [FIX] 外部脚本方式：文件操作在旧进程退出后执行，避免文件锁定
// ============================================================
export async function installUpdate() {
  if (currentState !== STATE.DOWNLOADED) {
    return { error: '更新未就绪' }
  }

  _installDone = false

  try {
    setState(STATE.INSTALLING)

    // autoUpdater 模式（安装版，非 portable）
    if (canUseAutoUpdater()) {
      _installDone = true
      autoUpdater.quitAndInstall(false, true)
      return { ok: true }
    }

    // portable 模式
    if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
      throw new Error('下载文件不存在')
    }

    const installer = await import('./installer.js')

    // [1/5] 隐藏主窗口（不关闭进程），更新窗口保持可见
    const mainWindow = getMainWindowRef()
    if (mainWindow) {
      mainWindow.hide()
      console.log('[updater] 主窗口已隐藏')
    }

    notifyInstallProgress({ step: 'preparing', message: '准备安装…' })
    await new Promise(r => setTimeout(r, 200))

    // [2/5] 尝试进程内安装（有进度显示）
    let installSuccess = false
    try {
      const installResult = await installer.performInstallInProcess({
        downloadedFilePath,
        currentExePath: process.execPath,
        onProgress: (prog) => {
          console.log('[updater] 安装进度:', prog.step, prog.message)
          notifyInstallProgress(prog)
        }
      })
      console.log('[updater] 进程内安装完成:', installResult)
      installSuccess = true
    } catch (installErr) {
      console.error('[updater] 进程内安装失败:', installErr.message)
      notifyInstallProgress({ step: 'preparing', message: '正在切换到外部更新模式…' })
      await new Promise(r => setTimeout(r, 200))
    }

    // [3/5] 释放单实例锁（无论哪种安装方式，新版本都需要获取锁）
    try {
      app.releaseSingleInstanceLock()
      console.log('[updater] 单实例锁已释放')
    } catch (e) {
      console.warn('[updater] 释放单实例锁失败:', e.message)
    }

    if (installSuccess) {
      // 进程内安装成功 → 直接启动新版本
      notifyInstallProgress({ step: 'launching', message: '正在启动新版本…' })
      await new Promise(r => setTimeout(r, 500))

      try {
        await installer.launchNewVersion(process.execPath)
        console.log('[updater] 新版本启动成功')
      } catch (launchErr) {
        console.error('[updater] 新版本启动失败，回退到外部脚本:', launchErr.message)
        // 启动失败，使用外部脚本重新安装并启动
        const scriptPath = installer.createExternalUpdateScript({
          downloadedFilePath,
          currentExePath: process.execPath,
          stagingDir: STAGING_DIR
        })
        await installer.launchExternalUpdater(scriptPath)
      }
    } else {
      // 进程内安装失败 → 使用外部脚本方式
      notifyInstallProgress({ step: 'launching', message: '正在启动外部更新程序…' })

      const scriptPath = installer.createExternalUpdateScript({
        downloadedFilePath,
        currentExePath: process.execPath,
        stagingDir: STAGING_DIR
      })
      await installer.launchExternalUpdater(scriptPath)
    }

    // [4/5] 清理暂存文件夹（外部脚本方式由脚本自身清理，这里仅清理进程内安装的残留）
    if (installSuccess) {
      notifyInstallProgress({ step: 'done', message: '更新完成，正在退出…' })
      try {
        if (fs.existsSync(STAGING_DIR)) {
          const files = fs.readdirSync(STAGING_DIR)
          for (const f of files) {
            try { fs.unlinkSync(path.join(STAGING_DIR, f)) } catch {}
          }
          try { fs.rmdirSync(STAGING_DIR) } catch {}
        }
      } catch {}
    } else {
      // 外部脚本方式：暂存文件夹由 bat 脚本清理
      notifyInstallProgress({ step: 'done', message: '更新已启动，正在退出…' })
    }

    // [5/5] 等待并退出
    // 外部脚本方式需要更多时间让 bat 脚本启动
    await new Promise(r => setTimeout(r, installSuccess ? 1000 : 1500))

    // 标记安装完成并重置状态，允许 before-quit 和 close 事件通过
    _installDone = true
    currentState = STATE.IDLE

    // 强制退出（不经过 before-quit 的下载/安装拦截逻辑）
    app.exit(0)
    return { ok: true }
  } catch (e) {
    console.error('[updater] installUpdate 失败:', e)
    lastError = e.message
    setState(STATE.ERROR)

    // 恢复主窗口
    const mainWindow = getMainWindowRef()
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }

    // 尝试重新获取单实例锁（如果之前释放了）
    try { app.requestSingleInstanceLock() } catch {}

    notifyInstallProgress({ step: 'error', message: e.message })
    return { error: e.message }
  }
}

export function cancelDownload() {
  if (currentState === STATE.DOWNLOADING || currentState === STATE.DELTA_DOWNLOADING) {
    // [FIX] 设置取消标志，阻止重试逻辑覆盖状态
    isCancelling = true

    // 取消自定义下载请求（完整下载或差分下载共用）
    if (customDownloadReq) {
      try { customDownloadReq.destroy() } catch { /* ignore */ }
      customDownloadReq = null
    }

    // 清理临时文件
    try {
      if (fs.existsSync(STAGING_DIR)) {
        const files = fs.readdirSync(STAGING_DIR)
        for (const f of files) {
          if (f.endsWith('.tmp') || f.endsWith('.delta')) {
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
  // 差分应用阶段：CPU 密集无法中断，标记取消后丢弃结果
  if (currentState === STATE.DELTA_APPLYING) {
    isCancelling = true
    downloadSessionId++
    setState(STATE.IDLE)
    return { ok: true, message: '已取消（差分应用阶段无法中断，结果将被丢弃）' }
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
  return currentState === STATE.DOWNLOADING ||
         currentState === STATE.DELTA_DOWNLOADING ||
         currentState === STATE.DELTA_APPLYING
}

export function isInstalling() {
  return currentState === STATE.INSTALLING
}

export function isInstallDone() {
  return _installDone
}

export function isDownloaded() {
  return currentState === STATE.DOWNLOADED
}

// ============================================================
// 初始化
// ============================================================
export async function initUpdater() {
  cleanupStaging()

  // 清理上次更新残留的 .old 文件
  try {
    const { cleanupOldExe } = await import('./installer.js')
    cleanupOldExe(process.execPath)
  } catch (e) {
    console.warn('[updater] 清理 .old 文件失败:', e.message)
  }

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
