// installer.test.mjs — 安装层单元测试
// 验证 PowerShell 安装脚本生成逻辑,覆盖中文路径、特殊字符等边界情况

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInstallScript } from '../electron/main/installer.js'

describe('buildInstallScript', () => {
  const baseOpts = {
    pid: 12345,
    downloadedFilePath: 'C:\\Temp\\update\\BookmarkManager-1.3.0-portable.exe',
    currentExePath: 'C:\\Users\\test\\AppData\\Local\\BookmarkManager.exe',
    stagingDir: 'C:\\Temp\\update'
  }

  test('包含进程 PID', () => {
    const script = buildInstallScript(baseOpts)
    assert.ok(script.includes('12345'), '脚本应包含 PID')
    assert.ok(script.includes('$TargetPid = 12345'), '应设置 $TargetPid 变量')
  })

  test('包含文件复制命令', () => {
    const script = buildInstallScript(baseOpts)
    assert.ok(script.includes('Copy-Item'), '应使用 Copy-Item 复制文件')
    assert.ok(script.includes('-LiteralPath'), '应使用 -LiteralPath 支持中文路径')
    assert.ok(script.includes(baseOpts.downloadedFilePath), '应包含下载文件路径')
    assert.ok(script.includes(baseOpts.currentExePath), '应包含目标 exe 路径')
  })

  test('包含启动和清理命令', () => {
    const script = buildInstallScript(baseOpts)
    assert.ok(script.includes('Start-Process'), '应包含 Start-Process 启动新版本')
    assert.ok(script.includes('Remove-Item'), '应包含 Remove-Item 清理暂存')
  })

  test('包含重试逻辑', () => {
    const script = buildInstallScript(baseOpts)
    assert.ok(script.includes('$maxRetry'), '应包含最大重试次数')
    assert.ok(script.includes('while (-not $copied'), '应包含重试循环')
  })

  test('包含等待进程退出逻辑', () => {
    const script = buildInstallScript(baseOpts)
    assert.ok(script.includes('Get-Process -Id $TargetPid'), '应等待原进程退出')
    assert.ok(script.includes('等待超时'), '应包含超时处理')
  })

  test('缺少参数时抛出错误', () => {
    assert.throws(() => buildInstallScript({}), /缺少必要参数/)
    assert.throws(() => buildInstallScript({ pid: 1 }), /缺少必要参数/)
    assert.throws(() => buildInstallScript({ pid: 1, downloadedFilePath: 'x' }), /缺少必要参数/)
  })

  test('中文路径正确处理', () => {
    const opts = {
      ...baseOpts,
      downloadedFilePath: 'D:\\代码\\书签管理器\\update\\new.exe',
      currentExePath: 'D:\\代码\\书签管理器\\BookmarkManager.exe',
      stagingDir: 'D:\\代码\\书签管理器\\update'
    }
    const script = buildInstallScript(opts)
    assert.ok(script.includes('D:\\代码\\书签管理器\\update\\new.exe'), '应包含中文路径')
    assert.ok(script.includes('D:\\代码\\书签管理器\\BookmarkManager.exe'), '应包含中文目标路径')
  })

  test('含单引号路径正确转义', () => {
    const opts = {
      ...baseOpts,
      downloadedFilePath: "C:\\test's dir\\update.exe"
    }
    const script = buildInstallScript(opts)
    // 单引号应被转义为两个单引号
    assert.ok(script.includes("C:\\test''s dir\\update.exe"), '单引号应被转义为两个单引号')
  })

  test('包含友好的安装步骤提示', () => {
    const script = buildInstallScript(baseOpts)
    assert.ok(script.includes('[1/4]'), '应显示步骤1')
    assert.ok(script.includes('[2/4]'), '应显示步骤2')
    assert.ok(script.includes('[3/4]'), '应显示步骤3')
    assert.ok(script.includes('[4/4]'), '应显示步骤4')
    assert.ok(script.includes('正在安装书签管理器更新'), '应显示安装标题')
  })

  test('失败时暂停等待用户确认', () => {
    const script = buildInstallScript(baseOpts)
    assert.ok(script.includes('ReadKey'), '失败时应等待用户按键')
    assert.ok(script.includes('更新安装失败'), '应显示失败信息')
  })

  test('PID 为数字类型', () => {
    const opts = { ...baseOpts, pid: '99999' }
    const script = buildInstallScript(opts)
    assert.ok(script.includes('$TargetPid = 99999'), 'PID 应被转为数字')
  })
})
