// updater-logic.test.mjs — 更新逻辑纯函数单元测试
// 使用 Node.js 内置 node:test 模块，无需额外依赖
// 运行: node --test test/updater-logic.test.mjs

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareVersions,
  formatBytes,
  formatETA,
  extractFileNameFromUrl,
  isValidDownloadUrl,
  pickBestAsset,
  buildUpdateBatContent,
  calcProgress
} from '../electron/main/updater-logic.js'

// ============================================================
// compareVersions
// ============================================================
describe('compareVersions', () => {
  test('相同版本返回 0', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
    assert.equal(compareVersions('v1.2.3', '1.2.3'), 0)
    assert.equal(compareVersions('2.0', '2.0.0'), 0)
  })

  test('大于返回 1', () => {
    assert.equal(compareVersions('1.1.0', '1.0.0'), 1)
    assert.equal(compareVersions('2.0.0', '1.9.9'), 1)
    assert.equal(compareVersions('1.0.1', '1.0.0'), 1)
    assert.equal(compareVersions('10.0.0', '9.0.0'), 1)
  })

  test('小于返回 -1', () => {
    assert.equal(compareVersions('1.0.0', '1.1.0'), -1)
    assert.equal(compareVersions('1.9.9', '2.0.0'), -1)
    assert.equal(compareVersions('0.9.0', '1.0.0'), -1)
  })

  test('带 v 前缀', () => {
    assert.equal(compareVersions('v1.1.0', 'v1.0.0'), 1)
    assert.equal(compareVersions('v1.0.0', 'v1.1.0'), -1)
  })

  test('不同位数版本', () => {
    assert.equal(compareVersions('1.2', '1.2.0'), 0)
    assert.equal(compareVersions('1.2.1', '1.2'), 1)
  })

  test('无效输入安全处理', () => {
    assert.equal(compareVersions(null, '1.0.0'), -1)
    assert.equal(compareVersions('', '0.0.0'), 0)
    assert.equal(compareVersions('abc', '0.0.0'), 0)
  })
})

// ============================================================
// formatBytes
// ============================================================
describe('formatBytes', () => {
  test('0 和负数', () => {
    assert.equal(formatBytes(0), '0 B')
    assert.equal(formatBytes(-1), '0 B')
    assert.equal(formatBytes(null), '0 B')
    assert.equal(formatBytes(undefined), '0 B')
  })

  test('字节级', () => {
    assert.equal(formatBytes(1), '1.0 B')
    assert.equal(formatBytes(512), '512.0 B')
    assert.equal(formatBytes(1023), '1023.0 B')
  })

  test('KB 级', () => {
    assert.equal(formatBytes(1024), '1.0 KB')
    assert.equal(formatBytes(1536), '1.5 KB')
    assert.equal(formatBytes(10240), '10.0 KB')
  })

  test('MB 级', () => {
    assert.equal(formatBytes(1048576), '1.0 MB')
    assert.equal(formatBytes(71932723), '68.6 MB')  // 68.4MB exe
  })

  test('GB 级', () => {
    assert.equal(formatBytes(1073741824), '1.0 GB')
  })
})

// ============================================================
// formatETA
// ============================================================
describe('formatETA', () => {
  test('0 或无效', () => {
    assert.equal(formatETA(0), '计算中…')
    assert.equal(formatETA(-1), '计算中…')
    assert.equal(formatETA(null), '计算中…')
  })

  test('秒级', () => {
    assert.equal(formatETA(1), '1 秒')
    assert.equal(formatETA(30), '30 秒')
    assert.equal(formatETA(59), '59 秒')
  })

  test('分钟级', () => {
    assert.equal(formatETA(60), '1 分')
    assert.equal(formatETA(90), '1 分 30 秒')
    assert.equal(formatETA(120), '2 分')
  })

  test('小时级', () => {
    assert.equal(formatETA(3600), '1 时 0 分')
    assert.equal(formatETA(3660), '1 时 1 分')
    assert.equal(formatETA(7200), '2 时 0 分')
  })
})

// ============================================================
// extractFileNameFromUrl
// ============================================================
describe('extractFileNameFromUrl', () => {
  test('正常 URL', () => {
    assert.equal(
      extractFileNameFromUrl('https://github.com/user/repo/releases/download/v1.0.0/BookmarkManager-1.0.0-portable.exe', 'fallback.exe'),
      'BookmarkManager-1.0.0-portable.exe'
    )
  })

  test('非 exe 文件使用 fallback', () => {
    assert.equal(
      extractFileNameFromUrl('https://example.com/path/file.zip', 'fallback.exe'),
      'fallback.exe'
    )
  })

  test('无效 URL 使用 fallback', () => {
    assert.equal(extractFileNameFromUrl('not-a-url', 'fallback.exe'), 'fallback.exe')
  })

  test('空 URL 使用 fallback', () => {
    assert.equal(extractFileNameFromUrl('', 'fallback.exe'), 'fallback.exe')
  })

  test('URL 末尾无文件名', () => {
    assert.equal(
      extractFileNameFromUrl('https://example.com/path/', 'fallback.exe'),
      'fallback.exe'
    )
  })
})

// ============================================================
// isValidDownloadUrl
// ============================================================
describe('isValidDownloadUrl', () => {
  test('有效 https', () => {
    assert.ok(isValidDownloadUrl('https://github.com/user/repo/releases/download/v1.0/file.exe'))
  })

  test('有效 http', () => {
    assert.ok(isValidDownloadUrl('http://localhost:8080/file.exe'))
  })

  test('无效协议', () => {
    assert.equal(isValidDownloadUrl('file:///C:/test.exe'), false)
    assert.equal(isValidDownloadUrl('ftp://example.com/file.exe'), false)
    assert.equal(isValidDownloadUrl('javascript:alert(1)'), false)
  })

  test('无效 URL', () => {
    assert.equal(isValidDownloadUrl('not-a-url'), false)
    assert.equal(isValidDownloadUrl(''), false)
    assert.equal(isValidDownloadUrl(null), false)
  })
})

// ============================================================
// pickBestAsset
// ============================================================
describe('pickBestAsset', () => {
  test('优先选择 portable', () => {
    const assets = [
      { name: 'Setup.exe', browser_download_url: 'https://example.com/setup.exe', size: 70000000 },
      { name: 'BookmarkManager-1.0.0-portable.exe', browser_download_url: 'https://example.com/portable.exe', size: 68000000 }
    ]
    const result = pickBestAsset(assets)
    assert.equal(result.url, 'https://example.com/portable.exe')
    assert.equal(result.size, 68000000)
  })

  test('无 portable 时选择 setup', () => {
    const assets = [
      { name: 'BookmarkManager-Setup-1.0.0.exe', browser_download_url: 'https://example.com/setup.exe', size: 75000000 }
    ]
    const result = pickBestAsset(assets)
    assert.equal(result.url, 'https://example.com/setup.exe')
  })

  test('无 portable 和 setup 时选择任意 exe', () => {
    const assets = [
      { name: 'app.exe', browser_download_url: 'https://example.com/app.exe', size: 50000000 }
    ]
    const result = pickBestAsset(assets)
    assert.equal(result.url, 'https://example.com/app.exe')
  })

  test('忽略非 exe 文件', () => {
    const assets = [
      { name: 'release-notes.md', browser_download_url: 'https://example.com/notes.md', size: 1000 },
      { name: 'app.zip', browser_download_url: 'https://example.com/app.zip', size: 50000 }
    ]
    const result = pickBestAsset(assets)
    assert.equal(result.url, null)
  })

  test('空数组', () => {
    const result = pickBestAsset([])
    assert.equal(result.url, null)
    assert.equal(result.size, 0)
  })

  test('null/undefined 输入', () => {
    assert.equal(pickBestAsset(null).url, null)
    assert.equal(pickBestAsset(undefined).url, null)
  })

  test('混合文件中只选 exe', () => {
    const assets = [
      { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt', size: 100 },
      { name: 'BookmarkManager-1.0.0-portable.exe', browser_download_url: 'https://example.com/portable.exe', size: 68000000 },
      { name: 'source.zip', browser_download_url: 'https://example.com/source.zip', size: 500000 }
    ]
    const result = pickBestAsset(assets)
    assert.equal(result.url, 'https://example.com/portable.exe')
  })
})

// ============================================================
// buildUpdateBatContent
// ============================================================
describe('buildUpdateBatContent', () => {
  const opts = {
    pid: 12345,
    downloadedFilePath: 'C:\\Temp\\bookmark-manager-update\\app.exe',
    currentExePath: 'C:\\Program Files\\BookmarkManager\\app.exe',
    stagingDir: 'C:\\Temp\\bookmark-manager-update'
  }

  test('包含 PID 等待逻辑', () => {
    const bat = buildUpdateBatContent(opts)
    assert.ok(bat.includes('12345'), '批处理应包含 PID')
    assert.ok(bat.includes(':wait'), '应包含等待循环')
    assert.ok(bat.includes('tasklist'), '应包含 tasklist 命令')
  })

  test('包含文件复制命令', () => {
    const bat = buildUpdateBatContent(opts)
    assert.ok(bat.includes('copy /y'), '应包含 copy 命令')
    assert.ok(bat.includes(opts.downloadedFilePath), '应包含下载文件路径')
    assert.ok(bat.includes(opts.currentExePath), '应包含目标路径')
  })

  test('包含启动和清理命令', () => {
    const bat = buildUpdateBatContent(opts)
    assert.ok(bat.includes('start ""'), '应包含 start 命令')
    assert.ok(bat.includes('rd /s /q'), '应包含清理命令')
    assert.ok(bat.includes(opts.stagingDir), '应包含暂存目录')
  })

  test('缺少参数时抛出错误', () => {
    assert.throws(() => buildUpdateBatContent({}), /缺少必要参数/)
    assert.throws(() => buildUpdateBatContent({ pid: 1 }), /缺少必要参数/)
  })

  test('UTF-8 编码设置', () => {
    const bat = buildUpdateBatContent(opts)
    assert.ok(bat.includes('chcp 65001'), '应设置 UTF-8 编码')
  })
})

// ============================================================
// calcProgress
// ============================================================
describe('calcProgress', () => {
  test('正常计算', () => {
    const prog = calcProgress(50000000, 100000000, 10000)  // 50MB / 100MB, 10s
    assert.equal(prog.percent, 50)
    assert.equal(prog.transferred, 50000000)
    assert.equal(prog.total, 100000000)
    assert.ok(prog.bytesPerSecond > 0, '速度应大于 0')
    assert.ok(prog.eta > 0, 'ETA 应大于 0')
  })

  test('0 字节时 percent 为 0', () => {
    const prog = calcProgress(0, 1000000, 1000)
    assert.equal(prog.percent, 0)
    assert.equal(prog.bytesPerSecond, 0)
    assert.equal(prog.eta, 0)
  })

  test('总大小未知时 percent 为 0', () => {
    const prog = calcProgress(50000, 0, 1000)
    assert.equal(prog.percent, 0)
    assert.ok(prog.transferred > 0, 'transferred 应有值')
  })

  test('100% 时 percent 为 100', () => {
    const prog = calcProgress(1000000, 1000000, 5000)
    assert.equal(prog.percent, 100)
    assert.equal(prog.eta, 0)
  })

  test('percent 不超过 100', () => {
    const prog = calcProgress(1100000, 1000000, 5000)
    assert.equal(prog.percent, 100)
  })

  test('ETA 计算正确', () => {
    // 50MB 已传，50MB 剩余，速度 5MB/s → 10秒
    const prog = calcProgress(5000000, 10000000, 1000)  // 5MB in 1s
    assert.equal(prog.eta, 1)  // 5MB remaining / 5MB/s = 1s
  })
})
