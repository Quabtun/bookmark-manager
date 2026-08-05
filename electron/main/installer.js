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

  onProgress({ step: 'installed', message: '文件安装完成' })
  return { ok: true, oldExePath }
}

// ============================================================
// 启动新版本
// ============================================================
export function launchNewVersion(exePath) {
  console.log('[installer] 启动新版本:', exePath)
  const child = spawn(exePath, [], {
    detached: true,
    stdio: 'ignore'
  })
  // 捕获 spawn 错误（如文件不存在），记录但不阻塞退出
  child.on('error', (err) => {
    console.error('[installer] 启动新版本失败:', err.message)
  })
  child.unref()
  console.log('[installer] 新版本已启动, pid:', child.pid)
  return { ok: true, pid: child.pid }
}
