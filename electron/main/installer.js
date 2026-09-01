// installer.js — 安装层
// 职责：在当前进程内完成 portable 模式的 exe 替换，不依赖外部脚本
//
// 设计要点：
// 1. 进程内安装 —— 不使用 PowerShell/bat 脚本，直接用 Node.js fs 操作
// 2. 重命名策略 —— Windows 允许重命名运行中的 exe，但不能覆盖
//    流程：rename(currentExe, .old) → copy(newExe, currentExe) → launch → exit
// 3. 流式复制 —— 大文件不阻塞事件循环，支持进度回调
// 4. 失败回滚 —— 复制失败时把 .old 改回来，恢复原状
// 5. 启动时清理 —— 新版本启动后删除 .old 文件

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

// ============================================================
// 清理上次更新残留的 .old 文件（应用启动时调用）
// ============================================================
export function cleanupOldExe(currentExePath) {
  const oldPath = currentExePath + '.old'
  try {
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath)
      console.log('[installer] 已清理旧版本文件:', oldPath)
    }
  } catch (e) {
    // .old 可能仍被占用（旧进程未完全退出），静默忽略
    console.warn('[installer] 清理 .old 失败(可能仍被占用):', e.message)
  }
}

// ============================================================
// 流式复制文件，支持进度回调
// ============================================================
function copyFileWithProgress(src, dst, onProgress) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(src)
    const totalSize = stat.size
    let copied = 0

    const readStream = fs.createReadStream(src)
    const writeStream = fs.createWriteStream(dst)

    readStream.on('data', (chunk) => {
      copied += chunk.length
      if (onProgress) {
        onProgress({
          copied,
          total: totalSize,
          percent: Math.round((copied / totalSize) * 100)
        })
      }
    })

    writeStream.on('finish', () => {
      resolve({ ok: true, size: totalSize })
    })

    readStream.on('error', (err) => {
      try { readStream.destroy() } catch {}
      try { writeStream.destroy() } catch {}
      reject(err)
    })
    writeStream.on('error', (err) => {
      try { readStream.destroy() } catch {}
      try { writeStream.destroy() } catch {}
      reject(err)
    })

    readStream.pipe(writeStream)
  })
}

// ============================================================
// 带重试的文件重命名
// ============================================================
async function renameWithRetry(src, dst, maxRetry = 5) {
  let lastError = null
  for (let i = 0; i < maxRetry; i++) {
    try {
      fs.renameSync(src, dst)
      return { ok: true }
    } catch (e) {
      lastError = e
      // 短暂等待后重试（杀毒软件可能短暂锁定文件）
      await new Promise(r => setTimeout(r, 500))
    }
  }
  throw lastError
}

// ============================================================
// 带重试的文件复制（流式）
// ============================================================
async function copyWithRetry(src, dst, onProgress, maxRetry = 3) {
  let lastError = null
  for (let i = 0; i < maxRetry; i++) {
    try {
      // 如果目标已存在（不应该，因为已重命名），先删除
      if (fs.existsSync(dst)) {
        fs.unlinkSync(dst)
      }
      const result = await copyFileWithProgress(src, dst, onProgress)
      return result
    } catch (e) {
      lastError = e
      if (i < maxRetry - 1) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }
  throw lastError
}

// ============================================================
// 执行安装：在当前进程内完成 exe 替换
// 流程：重命名当前 exe → 复制新 exe → 返回 oldExePath
// 失败时自动回滚，抛出异常
// ============================================================
export async function performInstallInProcess({
  downloadedFilePath,
  currentExePath,
  onProgress
}) {
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    throw new Error('下载的更新文件不存在: ' + downloadedFilePath)
  }
  if (!currentExePath) throw new Error('缺少当前程序路径')

  const oldExePath = currentExePath + '.old'

  // [1/3] 清理可能残留的 .old 文件
  onProgress({ step: 'preparing', message: '准备安装环境…' })
  try {
    if (fs.existsSync(oldExePath)) {
      fs.unlinkSync(oldExePath)
    }
  } catch (e) {
    // .old 可能被占用，使用备用名称
    console.warn('[installer] 清理旧 .old 失败，使用备用名称:', e.message)
  }

  // [2/3] 重命名当前 exe → .old
  onProgress({ step: 'renaming', message: '正在重命名当前版本…' })
  console.log('[installer] 重命名:', currentExePath, '→', oldExePath)
  try {
    await renameWithRetry(currentExePath, oldExePath)
  } catch (e) {
    throw new Error(`无法重命名当前程序文件: ${e.message}`)
  }

  // [3/3] 复制新版本到原路径（带进度）
  onProgress({ step: 'copying', message: '正在安装新版本文件…' })
  console.log('[installer] 复制:', downloadedFilePath, '→', currentExePath)
  try {
    await copyWithRetry(downloadedFilePath, currentExePath, (prog) => {
      onProgress({
        step: 'copying',
        message: `正在安装新版本文件… ${prog.percent}%`,
        percent: prog.percent,
        copied: prog.copied,
        total: prog.total
      })
    })
  } catch (e) {
    // 回滚：把 .old 改回来
    console.error('[installer] 复制失败，回滚:', e.message)
    try {
      // 先删除可能的不完整副本
      if (fs.existsSync(currentExePath)) {
        fs.unlinkSync(currentExePath)
      }
      fs.renameSync(oldExePath, currentExePath)
      console.log('[installer] 回滚成功')
    } catch (rollbackErr) {
      console.error('[installer] 回滚失败:', rollbackErr.message)
    }
    throw new Error(`无法复制新版本文件: ${e.message}`)
  }

  // [FIX] 安装后验证：检查新文件大小是否与源文件一致
  const newSize = fs.statSync(currentExePath).size
  const srcSize = fs.statSync(downloadedFilePath).size
  if (newSize !== srcSize) {
    console.error(`[installer] 安装后文件大小不匹配: 期望 ${srcSize}, 实际 ${newSize}`)
    throw new Error(`安装后文件大小不匹配: 期望 ${srcSize} 字节, 实际 ${newSize} 字节`)
  }
  console.log(`[installer] 安装验证通过: ${newSize} 字节`)

  onProgress({ step: 'installed', message: '文件安装完成' })
  return { ok: true, oldExePath }
}

// ============================================================
// 启动新版本 —— 返回 Promise，使用 spawn 事件确认进程已启动
// [FIX] 改为异步，等待 spawn 事件确认进程真正启动后再 resolve
// [FIX] 添加超时保护，避免事件丢失导致永久阻塞
// ============================================================
export function launchNewVersion(exePath) {
  return new Promise((resolve, reject) => {
    console.log('[installer] 启动新版本:', exePath)
    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore'
    })

    let settled = false

    // spawn 事件：进程已成功启动
    child.on('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      console.log('[installer] 新版本已启动, pid:', child.pid)
      resolve({ ok: true, pid: child.pid })
    })

    // error 事件：启动失败（文件不存在、权限不足等）
    child.on('error', (err) => {
      if (settled) return
      settled = true
      console.error('[installer] 启动新版本失败:', err.message)
      reject(new Error('启动新版本失败: ' + err.message))
    })

    // 超时保护：2 秒内未触发 spawn 事件也视为成功
    // （进程可能已启动但事件因 stdio: 'ignore' 而丢失）
    setTimeout(() => {
      if (settled) return
      settled = true
      child.unref()
      console.log('[installer] 新版本启动确认超时，假设已成功启动, pid:', child.pid)
      resolve({ ok: true, pid: child.pid, timeout: true })
    }, 2000)
  })
}

// ============================================================
// 外部脚本安装方式（备选 / 主要方案）
// 生成 bat 脚本，在旧进程退出后执行：
//   等待旧进程退出 → 重命名旧 exe → 复制新 exe → 启动新版本 → 清理
// 优势：文件操作在旧进程完全退出后进行，无文件锁定问题
// ============================================================
export function createExternalUpdateScript({ downloadedFilePath, currentExePath, stagingDir }) {
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    throw new Error('下载的更新文件不存在: ' + downloadedFilePath)
  }
  if (!currentExePath) throw new Error('缺少当前程序路径')

  const scriptDir = stagingDir || path.dirname(currentExePath)
  const scriptPath = path.join(scriptDir, 'bookmark-update.bat')

  // 统一路径格式
  const newExe = downloadedFilePath.replace(/\//g, '\\')
  const curExe = currentExePath.replace(/\//g, '\\')
  const exeName = path.basename(curExe)
  const oldName = exeName + '.old'
  const oldExe = curExe + '.old'
  const scriptDirStr = scriptDir.replace(/\//g, '\\')

  // bat 脚本：使用 %~dp0 获取脚本所在目录
  const script = `@echo off
chcp 65001 >nul 2>&1
:: 书签管理器自动更新脚本
:: 等待旧进程完全退出
timeout /t 3 /nobreak >nul
:: 清理残留的 .old 文件
if exist "${oldExe}" del /f /q "${oldExe}" 2>nul
:: 重命名当前 exe 为 .old（Windows 允许重命名运行中的 exe）
rename "${curExe}" "${oldName}" 2>nul
:: 复制新版本到原路径（带重试）
set /a retry=0
:copy_retry
copy /y "${newExe}" "${curExe}" >nul 2>&1
if %errorlevel% neq 0 (
  set /a retry+=1
  if %retry% lss 10 (
    timeout /t 1 /nobreak >nul
    goto copy_retry
  )
)
:: 启动新版本
start "" "${curExe}"
:: 清理旧文件和暂存文件夹
del /f /q "${oldExe}" 2>nul
del /f /q "${newExe}" 2>nul
rd /s /q "${scriptDirStr}" 2>nul
:: 删除自身
(goto) 2>nul & del "%~f0"
`

  fs.writeFileSync(scriptPath, script, 'utf-8')
  console.log('[installer] 外部更新脚本已创建:', scriptPath)
  return scriptPath
}

// ============================================================
// 启动外部更新脚本
// ============================================================
export function launchExternalUpdater(scriptPath) {
  console.log('[installer] 启动外部更新脚本:', scriptPath)
  const child = spawn('cmd.exe', ['/c', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })

  let settled = false

  return new Promise((resolve, reject) => {
    child.on('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      console.log('[installer] 更新脚本已启动, pid:', child.pid)
      resolve({ ok: true, pid: child.pid })
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      console.error('[installer] 启动更新脚本失败:', err.message)
      reject(new Error('启动更新脚本失败: ' + err.message))
    })

    // 超时保护
    setTimeout(() => {
      if (settled) return
      settled = true
      child.unref()
      console.log('[installer] 更新脚本启动超时，假设已成功, pid:', child.pid)
      resolve({ ok: true, pid: child.pid, timeout: true })
    }, 2000)
  })
}
