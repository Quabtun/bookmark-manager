// installer.test.mjs — 安装层单元测试
// 验证进程内安装逻辑：重命名+复制策略、清理函数、参数校验

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanupOldExe, performInstallInProcess, launchNewVersion } from '../electron/main/installer.js'

// 辅助：创建临时目录
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'installer-test-'))
}

// 辅助：创建临时文件
function makeTempFile(dir, name, content = 'test content') {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content)
  return p
}

describe('cleanupOldExe', () => {
  test('清理存在的 .old 文件', () => {
    const dir = makeTempDir()
    const exePath = path.join(dir, 'app.exe')
    const oldPath = exePath + '.old'
    fs.writeFileSync(exePath, 'exe')
    fs.writeFileSync(oldPath, 'old exe')

    cleanupOldExe(exePath)

    assert.ok(!fs.existsSync(oldPath), '.old 文件应被删除')
    assert.ok(fs.existsSync(exePath), '原 exe 不应被影响')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('.old 不存在时静默成功', () => {
    const dir = makeTempDir()
    const exePath = path.join(dir, 'app.exe')
    fs.writeFileSync(exePath, 'exe')

    // 不应抛出异常
    assert.doesNotThrow(() => cleanupOldExe(exePath))

    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('performInstallInProcess', () => {
  test('参数校验：缺少 downloadedFilePath 抛出错误', async () => {
    await assert.rejects(
      () => performInstallInProcess({ downloadedFilePath: '', currentExePath: 'x', onProgress: () => {} }),
      /下载的更新文件不存在/
    )
  })

  test('参数校验：缺少 currentExePath 抛出错误', async () => {
    const dir = makeTempDir()
    const src = makeTempFile(dir, 'new.exe', 'new')

    await assert.rejects(
      () => performInstallInProcess({ downloadedFilePath: src, currentExePath: '', onProgress: () => {} }),
      /缺少当前程序路径/
    )

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('成功完成重命名和复制', async () => {
    const dir = makeTempDir()
    const currentExe = makeTempFile(dir, 'app.exe', 'old exe content')
    const newExe = makeTempFile(dir, 'new.exe', 'new exe content')
    const progressCalls = []

    const result = await performInstallInProcess({
      downloadedFilePath: newExe,
      currentExePath: currentExe,
      onProgress: (prog) => progressCalls.push(prog)
    })

    // 验证返回值
    assert.ok(result.ok, '应返回 ok: true')
    assert.strictEqual(result.oldExePath, currentExe + '.old')

    // 验证文件：原路径应包含新内容
    assert.strictEqual(fs.readFileSync(currentExe, 'utf8'), 'new exe content')
    // .old 应包含旧内容
    assert.strictEqual(fs.readFileSync(currentExe + '.old', 'utf8'), 'old exe content')

    // 验证进度回调被调用
    assert.ok(progressCalls.length >= 3, '应至少有 preparing/renaming/copying 三个进度回调')
    assert.strictEqual(progressCalls[0].step, 'preparing')
    assert.ok(progressCalls.some(p => p.step === 'renaming'))
    assert.ok(progressCalls.some(p => p.step === 'installed'))

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('进度回调包含 copying 阶段的百分比', async () => {
    const dir = makeTempDir()
    const currentExe = makeTempFile(dir, 'app.exe', 'old')
    // 创建一个稍大的文件以触发多次 data 事件
    const bigContent = 'x'.repeat(1024 * 100)
    const newExe = makeTempFile(dir, 'new.exe', bigContent)
    const progressCalls = []

    await performInstallInProcess({
      downloadedFilePath: newExe,
      currentExePath: currentExe,
      onProgress: (prog) => progressCalls.push(prog)
    })

    const copyProgress = progressCalls.filter(p => p.step === 'copying')
    assert.ok(copyProgress.length > 0, '应有 copying 阶段进度')
    // 至少有一个进度带百分比
    assert.ok(copyProgress.some(p => typeof p.percent === 'number'), '应有百分比进度')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('安装前清理残留的 .old 文件', async () => {
    const dir = makeTempDir()
    const currentExe = makeTempFile(dir, 'app.exe', 'old exe')
    const newExe = makeTempFile(dir, 'new.exe', 'new exe')
    const oldOld = path.join(dir, 'app.exe.old')
    fs.writeFileSync(oldOld, 'stale old file')

    await performInstallInProcess({
      downloadedFilePath: newExe,
      currentExePath: currentExe,
      onProgress: () => {}
    })

    // .old 应包含旧的 exe 内容，而不是之前的残留
    assert.strictEqual(fs.readFileSync(currentExe + '.old', 'utf8'), 'old exe')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('源文件不存在时抛出错误', async () => {
    await assert.rejects(
      () => performInstallInProcess({
        downloadedFilePath: '/nonexistent/path/new.exe',
        currentExePath: '/some/path/app.exe',
        onProgress: () => {}
      }),
      /下载的更新文件不存在/
    )
  })
})

describe('launchNewVersion', () => {
  test('返回 ok 结构', () => {
    // launchNewVersion 不同步抛出错误（spawn 是异步的）
    // 只验证返回结构
    const result = launchNewVersion('notepad.exe')
    assert.ok(result.ok, '应返回 ok: true')
  })
})
