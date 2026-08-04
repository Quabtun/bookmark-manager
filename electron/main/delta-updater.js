// delta-updater.js — 客户端差分更新模块
// 职责:下载差分文件 → 读取本地 exe → 应用差分 → SHA256 校验 → 写入暂存目录
// 分层架构中的"差分层",由业务编排层 updater.js 调用

import fs from 'node:fs'
import path from 'node:path'
import { downloadToStream } from './http.js'
import { applyDelta, sha256, isDeltaWorthIt } from './delta-logic.js'

// ============================================================
// 下载差分文件到暂存目录
// ============================================================
export async function downloadDelta(url, destPath, { onProgress, timeout = 30000, onRequest } = {}) {
  const file = fs.createWriteStream(destPath)

  return new Promise((resolve, reject) => {
    downloadToStream(url, file, {
      onProgress: onProgress ? ({ receivedBytes, totalBytes }) => {
        onProgress({ receivedBytes, totalBytes })
      } : null,
      timeout,
      headers: { 'Accept': 'application/octet-stream' },
      onRequest
    }).then(() => {
      file.close(() => resolve({ ok: true, path: destPath }))
    }).catch((e) => {
      try { file.destroy() } catch { /* ignore */ }
      try { fs.unlinkSync(destPath) } catch { /* ignore */ }
      reject(e)
    })
  })
}

// ============================================================
// 读取本地 exe 文件
// ============================================================
export function readLocalExe(exePath) {
  if (!fs.existsSync(exePath)) {
    throw new Error('本地程序文件不存在: ' + exePath)
  }
  return fs.readFileSync(exePath)
}

// ============================================================
// 应用差分: 本地 exe + delta → 新 exe
// 返回 { ok, path, size, verified } 或 { error }
// ============================================================
export async function applyDeltaUpdate({ exePath, deltaPath, destPath, onProgress }) {
  let oldBuf = null
  let deltaBuf = null

  try {
    // 1. 读取本地 exe
    if (onProgress) onProgress({ phase: 'reading', message: '正在读取本地程序文件…' })
    oldBuf = readLocalExe(exePath)

    // 2. 读取差分文件
    if (onProgress) onProgress({ phase: 'reading-delta', message: '正在读取差分数据…' })
    deltaBuf = fs.readFileSync(deltaPath)

    // 3. 应用差分(CPU 密集,用 setImmediate 让出主线程)
    if (onProgress) onProgress({ phase: 'applying', message: '正在生成新版本文件…' })
    // 让 UI 有时间渲染"正在应用"状态
    await new Promise(r => setImmediate(r))

    const result = applyDelta(oldBuf, deltaBuf)

    if (!result.verified) {
      const expected = result.expectedHash.toString('hex').slice(0, 16)
      const actual = result.hash.toString('hex').slice(0, 16)
      throw new Error(`差分校验失败: SHA256 不匹配 (期望 ${expected}…, 实际 ${actual}…)`)
    }

    // 4. 写入暂存目录
    if (onProgress) onProgress({ phase: 'writing', message: '正在保存新版本文件…' })
    fs.writeFileSync(destPath, result.buf)

    return {
      ok: true,
      path: destPath,
      size: result.buf.length,
      verified: true,
      hash: result.hash.toString('hex')
    }
  } catch (e) {
    return { error: e.message }
  } finally {
    // 清理大 Buffer 引用,帮助 GC
    oldBuf = null
    deltaBuf = null
  }
}

// ============================================================
// 完整的差分更新流程:
// 下载 delta → 读取本地 exe → 应用差分 → 写入新 exe
// 失败时返回 { error },调用方应回退完整下载
// ============================================================
export async function performDeltaUpdate({
  deltaUrl,
  deltaSize,
  exePath,
  stagingDir,
  destFileName,
  onDownloadProgress,
  onApplyProgress,
  onRequest
}) {
  const deltaPath = path.join(stagingDir, 'update.delta')
  const destPath = path.join(stagingDir, destFileName)

  // 确保暂存目录存在
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true })
  }

  // 1. 下载差分文件
  try {
    await downloadDelta(deltaUrl, deltaPath, { onProgress: onDownloadProgress, onRequest })
  } catch (e) {
    try { fs.unlinkSync(deltaPath) } catch { /* ignore */ }
    return { error: '差分下载失败: ' + e.message, fallback: true }
  }

  // 2. 应用差分
  const result = await applyDeltaUpdate({
    exePath,
    deltaPath,
    destPath,
    onProgress: onApplyProgress
  })

  // 3. 清理差分文件(无论成功失败)
  try { fs.unlinkSync(deltaPath) } catch { /* ignore */ }

  if (result.error) {
    return { error: result.error, fallback: true }
  }

  return result
}
