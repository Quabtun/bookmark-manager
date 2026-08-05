// updater-logic.js — 更新逻辑的纯函数模块
// 无 Electron / Node IO 依赖，可独立单元测试

// ============================================================
// 版本比较：v1 > v2 返回 1，相等返回 0，小于返回 -1
// ============================================================
export function compareVersions(v1, v2) {
  const parts1 = String(v1 || '').replace(/^v/, '').split('.').map(n => parseInt(n) || 0)
  const parts2 = String(v2 || '').replace(/^v/, '').split('.').map(n => parseInt(n) || 0)
  const len = Math.max(parts1.length, parts2.length)
  for (let i = 0; i < len; i++) {
    const a = parts1[i] || 0
    const b = parts2[i] || 0
    if (a < b) return -1
    if (a > b) return 1
  }
  return 0
}

// ============================================================
// 格式化字节数为可读字符串
// ============================================================
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, val = bytes
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
  return val.toFixed(1) + ' ' + units[i]
}

// ============================================================
// 格式化剩余时间（秒 → 可读时间）
// ============================================================
export function formatETA(seconds) {
  if (!seconds || seconds <= 0) return '计算中…'
  if (seconds < 60) return seconds + ' 秒'
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (min < 60) return sec > 0 ? `${min} 分 ${sec} 秒` : `${min} 分`
  const hr = Math.floor(min / 60)
  const remainMin = min % 60
  return `${hr} 时 ${remainMin} 分`
}

// ============================================================
// 从下载 URL 提取文件名
// ============================================================
export function extractFileNameFromUrl(url, fallback) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const name = parts[parts.length - 1] || fallback
    if (!name) return fallback
    return name.endsWith('.exe') ? name : fallback
  } catch {
    return fallback
  }
}

// ============================================================
// 验证下载 URL 是否合法
// ============================================================
export function isValidDownloadUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// ============================================================
// 从 GitHub Release assets 中提取最佳下载 URL
// 优先 portable exe，其次 setup exe，最后任意 exe
// ============================================================
export function pickBestAsset(assets) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return { url: null, size: 0 }
  }

  // 优先 portable
  let portable = null
  let installer = null
  let anyExe = null

  for (const a of assets) {
    const name = (a.name || '').toLowerCase()
    if (!name.endsWith('.exe')) continue
    if (name.includes('portable') && !portable) {
      portable = { url: a.browser_download_url, size: a.size || 0 }
    }
    if (name.includes('setup') && !installer) {
      installer = { url: a.browser_download_url, size: a.size || 0 }
    }
    if (!anyExe) {
      anyExe = { url: a.browser_download_url, size: a.size || 0 }
    }
  }

  return portable || installer || anyExe || { url: null, size: 0 }
}

// ============================================================
// 生成 portable 模式更新批处理脚本
// @deprecated 已被 installer.js#performInstallInProcess (进程内安装) 取代
// 保留此函数供现有单元测试使用
// ============================================================
export function buildUpdateBatContent(options) {
  const { pid, downloadedFilePath, currentExePath, stagingDir } = options
  if (!pid || !downloadedFilePath || !currentExePath || !stagingDir) {
    throw new Error('buildUpdateBatContent: 缺少必要参数')
  }

  return `@echo off
chcp 65001 >nul 2>&1
echo 正在安装更新...
timeout /t 2 /nobreak >nul

:: 等待原程序退出
:wait
tasklist /fi "pid eq ${pid}" 2>nul | find "${pid}" >nul
if not errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait
)

:: 复制新版本覆盖旧版本
copy /y "${downloadedFilePath}" "${currentExePath}"
if errorlevel 1 (
  echo 更新失败：无法替换文件
  timeout /t 3 /nobreak >nul
  exit /b 1
)

:: 启动新版本
start "" "${currentExePath}"

:: 清理暂存文件夹
rd /s /q "${stagingDir}"

exit /b 0
`
}

// ============================================================
// 计算下载进度
// ============================================================
export function calcProgress(receivedBytes, totalBytes, elapsedMs) {
  const elapsedSec = elapsedMs / 1000
  const speed = elapsedSec > 0 ? receivedBytes / elapsedSec : 0
  const remainingBytes = totalBytes - receivedBytes
  const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0
  return {
    percent: totalBytes > 0 ? Math.min(100, Math.round(receivedBytes / totalBytes * 100)) : 0,
    transferred: receivedBytes,
    total: totalBytes,
    bytesPerSecond: Math.round(speed),
    eta
  }
}
