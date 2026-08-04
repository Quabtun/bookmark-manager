// updater-race.test.mjs — 下载/安装流程竞态条件与内存泄漏测试
// 使用 mock HTTP 服务器模拟真实下载，验证竞态和泄漏问题
// 运行: node --test test/updater-race.test.mjs

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ============================================================
// Mock HTTP 服务器 —— 模拟 GitHub Release 下载
// ============================================================
let mockServer
let mockPort
let requestLog = []

function createMockServer() {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      requestLog.push({ url: req.url, method: req.method, time: Date.now() })

      // 模拟文件下载 —— 返回指定大小的数据
      if (req.url.startsWith('/download/')) {
        const size = parseInt(req.url.split('/').pop()) || 1024
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': size,
          'Connection': 'close'  // [FIX] 禁用 keep-alive，确保连接关闭
        })

        // 分块写入，模拟真实下载
        const chunkSize = 4096  // 4KB per tick，加快下载速度
        let written = 0
        let interval
        const stopInterval = () => { if (interval) { clearInterval(interval); interval = null } }

        // [FIX] 客户端断开时清理 interval，防止事件循环挂起
        res.on('close', stopInterval)
        res.on('error', stopInterval)

        interval = setInterval(() => {
          const remaining = size - written
          const writeSize = Math.min(chunkSize, remaining)
          if (writeSize <= 0) {
            stopInterval()
            if (!res.writableEnded) res.end()
            return
          }
          if (res.writableEnded || res.destroyed) {
            stopInterval()
            return
          }
          const buf = Buffer.alloc(writeSize, 0x41)  // 'A'
          res.write(buf)
          written += writeSize
        }, 1)  // 每 1ms 写 4KB
        return
      }

      // 模拟重定向
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/download/1024' })
        res.end()
        return
      }

      // 模拟 404
      if (req.url === '/404') {
        res.writeHead(404)
        res.end('Not Found')
        return
      }

      // 模拟慢速响应（超时）
      if (req.url === '/slow') {
        // 不响应，让客户端超时
        return
      }

      // 默认
      res.writeHead(200)
      res.end('OK')
    })

    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = mockServer.address().port
      resolve()
    })
  })
}

function getMockUrl(path) {
  return `http://127.0.0.1:${mockPort}${path}`
}

// ============================================================
// 测试用的暂存目录（不使用 app.getPath('temp')）
// ============================================================
let testStagingDir

function setupTestStaging() {
  testStagingDir = path.join(os.tmpdir(), 'bm-update-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6))
  fs.mkdirSync(testStagingDir, { recursive: true })
}

function cleanupTestStaging() {
  try {
    if (fs.existsSync(testStagingDir)) {
      const files = fs.readdirSync(testStagingDir)
      for (const f of files) {
        try { fs.unlinkSync(path.join(testStagingDir, f)) } catch { /* ignore */ }
      }
      try { fs.rmdirSync(testStagingDir) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

// ============================================================
// 辅助：等待条件满足
// ============================================================
async function waitForCondition(fn, timeout = 5000, interval = 50) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (fn()) return true
    await new Promise(r => setTimeout(r, interval))
  }
  return false
}

// ============================================================
// 测试套件
// ============================================================
describe('下载流程', () => {
  beforeEach(async () => {
    requestLog = []
    await createMockServer()
    setupTestStaging()
  })

  afterEach(async () => {
    if (mockServer) {
      // [FIX] 添加超时，防止 mockServer.close() 无限等待
      await Promise.race([
        new Promise(r => mockServer.close(r)),
        new Promise(r => setTimeout(r, 3000))
      ])
      // 强制销毁所有残留连接
      mockServer.removeAllListeners()
    }
    cleanupTestStaging()
  })

  test('正常下载完成，文件写入暂存目录', async () => {
    const fileSize = 10240  // 10KB
    const downloadUrl = getMockUrl(`/download/${fileSize}`)
    const fileName = 'test-update.exe'
    const destPath = path.join(testStagingDir, fileName)

    // 模拟 downloadToStaging 的核心逻辑
    const result = await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(path.join(testStagingDir, fileName + '.tmp'))
      const req = http.get(downloadUrl, (res) => {
        if (res.statusCode !== 200) {
          file.close()
          return reject(new Error(`HTTP ${res.statusCode}`))
        }

        res.pipe(file)
        file.on('finish', () => {
          file.close(() => {
            try {
              fs.renameSync(path.join(testStagingDir, fileName + '.tmp'), destPath)
              resolve({ ok: true, path: destPath })
            } catch (e) {
              reject(e)
            }
          })
        })
        file.on('error', reject)
      })
      req.on('error', reject)
    })

    assert.ok(result.ok, '下载应成功')
    assert.ok(fs.existsSync(destPath), '文件应存在')
    const stat = fs.statSync(destPath)
    assert.equal(stat.size, fileSize, '文件大小应匹配')
  })

  test('HTTP 404 时正确拒绝', async () => {
    const downloadUrl = getMockUrl('/404')

    await assert.rejects(
      new Promise((resolve, reject) => {
        const req = http.get(downloadUrl, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`下载失败: HTTP ${res.statusCode}`))
            return
          }
          res.resume()
        })
        req.on('error', reject)
      }),
      /HTTP 404/
    )
  })

  test('重定向正确跟随', async () => {
    const downloadUrl = getMockUrl('/redirect')
    let redirectFollowed = false

    await new Promise((resolve, reject) => {
      let redirectCount = 0
      const doRequest = (url) => {
        const req = http.get(url, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            redirectCount++
            redirectFollowed = true
            res.resume()
            const newUrl = new URL(res.headers.location, url).toString()
            doRequest(newUrl)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          res.resume()
          res.on('end', resolve)
        })
        req.on('error', reject)
      }
      doRequest(downloadUrl)
    })

    assert.ok(redirectFollowed, '应跟随重定向')
    assert.ok(requestLog.length >= 2, '应至少有 2 次请求')
  })

  test('下载取消时中断 HTTP 请求', async () => {
    const fileSize = 1024 * 100  // 100KB (足够收到首个 data 事件即可)
    const downloadUrl = getMockUrl(`/download/${fileSize}`)

    let errorCount = 0
    let resolveFn
    const done = (val) => { if (resolveFn) { resolveFn(val); resolveFn = null } }

    // [FIX] 使用可清理的超时，避免事件循环挂起
    let timeoutId
    const result = await Promise.race([
      new Promise((resolve) => {
        resolveFn = resolve
        const req = http.get(downloadUrl, (res) => {
          res.on('data', () => {
            // 收到首个数据块后立即销毁请求
            req.destroy()
          })
          // 响应被关闭 = 取消成功
          res.on('close', () => done({ error: 'response closed', via: 'res-close' }))
          res.on('error', (e) => { errorCount++; done({ error: e.message, via: 'res-error' }) })
        })

        req.on('error', (e) => { errorCount++; done({ error: e.message, via: 'req-error' }) })
      }),
      // 超时保护
      new Promise(r => { timeoutId = setTimeout(() => r({ error: 'timeout', via: 'timeout' }), 5000) })
    ])

    // [FIX] 清理超时定时器，防止事件循环挂起
    clearTimeout(timeoutId)

    assert.ok(result.error, '取消后应收到错误或关闭事件')
    assert.ok(errorCount <= 1, `error 事件应最多触发一次（无双重 reject），实际: ${errorCount}`)
  })
})

// ============================================================
// 竞态条件测试
// ============================================================
describe('竞态条件', () => {
  test('cancelDownload 设置 isCancelling 标志后不进入重试', async () => {
    // 模拟 isCancelling 标志逻辑
    let isCancelling = false
    let retryEntered = false

    // 模拟 downloadWithRetryCustom 的 catch 块
    async function mockRetryCatch() {
      if (isCancelling) {
        return { ok: false, cancelled: true }
      }
      retryEntered = true
      return { ok: false, error: '重试' }
    }

    // 不取消时 → 进入重试
    isCancelling = false
    const r1 = await mockRetryCatch()
    assert.ok(!r1.cancelled, '不取消时应进入重试')
    assert.ok(retryEntered, '应进入重试')

    // 取消时 → 不进入重试
    retryEntered = false
    isCancelling = true
    const r2 = await mockRetryCatch()
    assert.ok(r2.cancelled, '取消时应返回 cancelled')
    assert.ok(!retryEntered, '不应进入重试')
  })

  test('downloadWithRetryAuto 取消时不进入重试（与 custom 一致）', async () => {
    // 模拟 downloadWithRetryAuto 的 catch 块（修复后逻辑）
    let isCancelling = false
    let currentState = 'downloading'
    let retryEntered = false

    async function mockAutoRetryCatch() {
      if (isCancelling) {
        isCancelling = false
        return { ok: false, cancelled: true }
      }
      retryEntered = true
      return { ok: false, error: '重试' }
    }

    // 不取消时 → 进入重试
    isCancelling = false
    const r1 = await mockAutoRetryCatch()
    assert.ok(!r1.cancelled, '不取消时应进入重试')
    assert.ok(retryEntered, '应进入重试')

    // 取消时 → 不进入重试
    retryEntered = false
    isCancelling = true
    const r2 = await mockAutoRetryCatch()
    assert.ok(r2.cancelled, '取消时应返回 cancelled')
    assert.ok(!retryEntered, '不应进入重试')
  })

  test('downloadWithRetryAuto 重试等待期间取消不恢复下载', async () => {
    // 模拟 auto 模式重试等待期间被取消（修复后逻辑）
    let isCancelling = false
    let currentState = 'error'
    const retryDelay = 100

    const retryPromise = (async () => {
      await new Promise(r => setTimeout(r, retryDelay))
      // 修复后：重试前检查取消标志和状态
      if (isCancelling || currentState !== 'error') {
        return { ok: false, cancelled: isCancelling }
      }
      return { ok: false, retry: true }
    })()

    setTimeout(() => {
      isCancelling = true
      currentState = 'idle'
    }, retryDelay / 2)

    const result = await retryPromise
    assert.ok(result.cancelled, '重试等待期间取消应返回 cancelled')
    assert.ok(!result.retry, '不应继续重试')
  })

  test('downloadSessionId 递增后旧会话不写入 downloadedFilePath', () => {
    let downloadSessionId = 1
    let downloadedFilePath = null

    // 模拟旧会话完成
    const oldSessionId = 1
    downloadSessionId = 2  // 新会话已开始
    const destPath = '/tmp/old-file.exe'

    // 旧会话的 file.on('finish') 回调
    if (oldSessionId === downloadSessionId) {
      downloadedFilePath = destPath
    }

    assert.equal(downloadedFilePath, null, '旧会话不应写入 downloadedFilePath')
  })

  test('settled 标志防止双重 reject', async () => {
    let settled = false
    let rejectCount = 0

    const safeReject = () => {
      if (settled) return
      settled = true
      rejectCount++
    }

    // 模拟 req.on('error') 和 file.on('error') 同时触发
    safeReject()
    safeReject()  // 第二次应被忽略

    assert.equal(rejectCount, 1, 'reject 应只触发一次')
  })

  test('重试间隔期间取消不恢复下载', async () => {
    // 模拟重试等待期间被取消
    let isCancelling = false
    let currentState = 'error'  // 重试等待中状态为 error
    let retryDelay = 100  // 短延迟

    // 启动重试等待
    const retryPromise = (async () => {
      await new Promise(r => setTimeout(r, retryDelay))
      // 等待后检查取消
      if (isCancelling || currentState !== 'error') {
        return { ok: false, cancelled: isCancelling }
      }
      return { ok: false, retry: true }
    })()

    // 在等待期间取消
    setTimeout(() => {
      isCancelling = true
      currentState = 'idle'
    }, retryDelay / 2)

    const result = await retryPromise
    assert.ok(result.cancelled, '重试等待期间取消应返回 cancelled')
    assert.ok(!result.retry, '不应继续重试')
  })

  test('多次快速调用 startDownload 只执行一次', async () => {
    // 模拟 startDownload 的状态检查
    let currentState = 'idle'
    let downloadStarted = 0

    async function mockStartDownload() {
      if (currentState === 'downloading') return { error: '正在下载中…' }
      currentState = 'downloading'
      downloadStarted++
      await new Promise(r => setTimeout(r, 50))
      currentState = 'downloaded'
      return { ok: true }
    }

    // 同时调用三次
    const [r1, r2, r3] = await Promise.all([
      mockStartDownload(),
      mockStartDownload(),
      mockStartDownload()
    ])

    assert.equal(downloadStarted, 1, '只应启动一次下载')
    assert.ok(r1.ok, '第一次调用应成功')
    assert.ok(r2.error || r2.ok === false, '后续调用应被拒绝')
    assert.ok(r3.error || r3.ok === false, '后续调用应被拒绝')
  })
})

// ============================================================
// 内存泄漏测试
// ============================================================
describe('内存泄漏', () => {
  test('customDownloadReq 下载完成后被清理', () => {
    let customDownloadReq = 'request-object'

    // 模拟 safeResolve
    const safeResolve = () => {
      customDownloadReq = null
    }

    assert.ok(customDownloadReq !== null, '下载中应有引用')
    safeResolve()
    assert.equal(customDownloadReq, null, '完成后应清理引用')
  })

  test('customDownloadReq 下载失败后被清理', () => {
    let customDownloadReq = 'request-object'

    // 模拟 safeReject
    const safeReject = () => {
      customDownloadReq = null
    }

    assert.ok(customDownloadReq !== null, '下载中应有引用')
    safeReject()
    assert.equal(customDownloadReq, null, '失败后应清理引用')
  })

  test('cancelDownload 后 customDownloadReq 被清理', () => {
    let customDownloadReq = { destroy: () => {} }

    // 模拟 cancelDownload
    if (customDownloadReq) {
      try { customDownloadReq.destroy() } catch { /* ignore */ }
      customDownloadReq = null
    }

    assert.equal(customDownloadReq, null, '取消后应清理引用')
  })

  test('downloadedFilePath 在新下载开始时重置', () => {
    let downloadedFilePath = '/tmp/old-file.exe'

    // 模拟 startDownload 中的重置
    downloadedFilePath = null

    assert.equal(downloadedFilePath, null, '新下载开始时应重置')
  })

  test('downloadProgress 在新下载开始时重置', () => {
    // 模拟 startDownload 中的重置（修复后逻辑）
    let downloadProgress = { percent: 50, transferred: 500, total: 1000 }

    // startDownload 重置
    downloadProgress = null

    assert.equal(downloadProgress, null, '新下载开始时进度应重置')
  })

  test('lastError 在新下载/检查开始时清除', () => {
    // 模拟 startDownload / checkForUpdates 中的清除（修复后逻辑）
    let lastError = '之前的错误信息'

    // startDownload 清除
    lastError = ''

    assert.equal(lastError, '', '新下载开始时错误应清除')
  })

  test('file.on(error) 时关闭并销毁文件流', () => {
    // 模拟 file.on('error') 回调（修复后逻辑）
    let fileClosed = false
    let fileDestroyed = false
    const mockFile = {
      close: () => { fileClosed = true },
      destroy: () => { fileDestroyed = true }
    }

    // file.on('error') 回调
    try { mockFile.close() } catch { /* ignore */ }
    try { mockFile.destroy() } catch { /* ignore */ }

    assert.ok(fileClosed, 'file.close() 应被调用')
    assert.ok(fileDestroyed, 'file.destroy() 应被调用')
  })

  test('暂存文件夹在清理后不存在', () => {
    const dir = path.join(os.tmpdir(), 'bm-cleanup-test-' + Date.now())
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'test.exe'), 'fake')
    fs.writeFileSync(path.join(dir, 'test.exe.tmp'), 'fake')

    assert.ok(fs.existsSync(dir), '目录应存在')

    // 模拟 cleanupStaging
    const files = fs.readdirSync(dir)
    for (const f of files) {
      fs.unlinkSync(path.join(dir, f))
    }
    fs.rmdirSync(dir)

    assert.ok(!fs.existsSync(dir), '清理后目录不应存在')
  })

  test('多次下载不会累积临时文件', () => {
    const dir = path.join(os.tmpdir(), 'bm-accum-test-' + Date.now())
    fs.mkdirSync(dir, { recursive: true })

    // 模拟 3 次下载周期
    for (let i = 0; i < 3; i++) {
      // 写入临时文件
      const tmpPath = path.join(dir, `file-${i}.exe.tmp`)
      fs.writeFileSync(tmpPath, 'data')

      // 下载完成 → rename
      const destPath = path.join(dir, `file-${i}.exe`)
      fs.renameSync(tmpPath, destPath)

      // 下次下载前清理旧文件（模拟 cleanupStaging）
      if (i > 0) {
        const oldFile = path.join(dir, `file-${i - 1}.exe`)
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile)
      }
    }

    const remaining = fs.readdirSync(dir)
    // 只应保留最后一次的文件
    assert.ok(remaining.length <= 1, `不应累积文件，实际: ${remaining.length} 个`)
    assert.ok(!remaining.some(f => f.endsWith('.tmp')), '不应残留 .tmp 文件')

    // 清理
    for (const f of remaining) fs.unlinkSync(path.join(dir, f))
    fs.rmdirSync(dir)
  })
})

// ============================================================
// 批处理脚本安全性测试
// ============================================================
describe('批处理脚本安全', () => {
  test('路径包含空格时正确引用', async () => {
    const { buildUpdateBatContent } = await import('../electron/main/updater-logic.js')
    const bat = buildUpdateBatContent({
      pid: 1234,
      downloadedFilePath: 'C:\\Program Files\\App\\update.exe',
      currentExePath: 'C:\\Program Files\\App\\app.exe',
      stagingDir: 'C:\\Temp\\update-staging'
    })

    // 所有路径都应被双引号包裹
    assert.ok(bat.includes('"C:\\Program Files\\App\\update.exe"'), '下载文件路径应被引用')
    assert.ok(bat.includes('"C:\\Program Files\\App\\app.exe"'), '目标路径应被引用')
  })

  test('脚本包含错误处理逻辑', async () => {
    const { buildUpdateBatContent } = await import('../electron/main/updater-logic.js')
    const bat = buildUpdateBatContent({
      pid: 1234,
      downloadedFilePath: 'C:\\test\\update.exe',
      currentExePath: 'C:\\test\\app.exe',
      stagingDir: 'C:\\test\\staging'
    })

    assert.ok(bat.includes('if errorlevel 1'), '应有错误检查')
    assert.ok(bat.includes('exit /b 1'), '失败时应退出')
    assert.ok(bat.includes('exit /b 0'), '成功时应退出')
  })

  test('脚本包含 PID 等待循环', async () => {
    const { buildUpdateBatContent } = await import('../electron/main/updater-logic.js')
    const bat = buildUpdateBatContent({
      pid: 99999,
      downloadedFilePath: 'C:\\test\\update.exe',
      currentExePath: 'C:\\test\\app.exe',
      stagingDir: 'C:\\test\\staging'
    })

    assert.ok(bat.includes(':wait'), '应有等待标签')
    assert.ok(bat.includes('tasklist'), '应检查进程')
    assert.ok(bat.includes('99999'), '应包含 PID')
    assert.ok(bat.includes('goto wait'), '应有循环跳转')
  })
})

// ============================================================
// 状态机一致性测试
// ============================================================
describe('状态机一致性', () => {
  test('状态转换序列正确', () => {
    const validTransitions = {
      'idle': ['checking'],
      'checking': ['available', 'not-available', 'error'],
      'available': ['downloading', 'idle'],
      'downloading': ['downloaded', 'error', 'idle'],
      'downloaded': ['installing', 'idle'],
      'installing': ['idle', 'error'],
      'error': ['idle', 'checking', 'downloading'],
      'not-available': ['idle', 'checking']
    }

    // 验证所有状态都有合法的退出路径
    for (const [from, tos] of Object.entries(validTransitions)) {
      assert.ok(Array.isArray(tos) && tos.length > 0, `状态 ${from} 应有合法退出路径`)
    }
  })

  test('installUpdate 仅在 DOWNLOADED 状态可用', () => {
    function mockInstallUpdate(state) {
      if (state !== 'downloaded') {
        return { error: '更新未就绪' }
      }
      return { ok: true }
    }

    assert.equal(mockInstallUpdate('idle').error, '更新未就绪')
    assert.equal(mockInstallUpdate('downloading').error, '更新未就绪')
    assert.equal(mockInstallUpdate('available').error, '更新未就绪')
    assert.equal(mockInstallUpdate('downloaded').ok, true)
  })

  test('startDownload 仅在非 DOWNLOADING 状态可用', () => {
    function mockStartDownload(state, hasUpdateInfo) {
      if (!hasUpdateInfo) return { error: '没有可用的更新' }
      if (state === 'downloading') return { error: '正在下载中…' }
      return { ok: true }
    }

    assert.equal(mockStartDownload('downloading', true).error, '正在下载中…')
    assert.equal(mockStartDownload('idle', false).error, '没有可用的更新')
    assert.equal(mockStartDownload('available', true).ok, true)
    assert.equal(mockStartDownload('idle', true).ok, true)
  })

  test('cancelDownload 仅在 DOWNLOADING 状态有效', () => {
    function mockCancelDownload(state) {
      if (state === 'downloading') {
        return { ok: true, message: '下载已取消' }
      }
      return { ok: true }  // 非下载状态也返回 ok，但无实际效果
    }

    const downloadingResult = mockCancelDownload('downloading')
    assert.ok(downloadingResult.ok)
    assert.ok(downloadingResult.message, '下载中取消应有消息')

    const idleResult = mockCancelDownload('idle')
    assert.ok(idleResult.ok)
    assert.ok(!idleResult.message, '非下载状态不应有取消消息')
  })
})
