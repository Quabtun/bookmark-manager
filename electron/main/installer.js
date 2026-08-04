// installer.js — 安装层
// 职责：生成安装脚本并 spawn 安装进程，完成 portable 模式的 exe 替换
// 分层架构中的"安装层"，由业务编排层 updater.js 调用
//
// 设计要点：
// 1. 使用 PowerShell 替代 bat —— PS 原生支持 UTF-8 和中文路径，避免 bat 中文路径复制失败
// 2. 显示可见窗口 —— 安装过程中用户能看到进度，失败时能看到错误信息
// 3. 带重试的文件复制 —— exe 可能被短暂占用，重试提升成功率
// 4. Wait-Process 等待退出 —— 比 tasklist 判断 pid 更可靠

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

// PowerShell 单引号字符串转义：单引号 -> 两个单引号
function psEscape(s) {
  return String(s).replace(/'/g, "''")
}

// ============================================================
// 生成 PowerShell 安装脚本内容（纯函数，可测试）
// ============================================================
export function buildInstallScript({ pid, downloadedFilePath, currentExePath, stagingDir }) {
  if (!pid || !downloadedFilePath || !currentExePath || !stagingDir) {
    throw new Error('buildInstallScript: 缺少必要参数')
  }

  const sPid = Number(pid)
  const sSrc = psEscape(downloadedFilePath)
  const sDst = psEscape(currentExePath)
  const sStaging = psEscape(stagingDir)

  return `# 书签管理器 - 更新安装脚本
# 由 installer.js 自动生成
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$TargetPid = ${sPid}
$Src = '${sSrc}'
$Dst = '${sDst}'
$Staging = '${sStaging}'

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  正在安装书签管理器更新" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# [1/4] 等待原进程退出
Write-Host "[1/4] 等待应用退出..." -ForegroundColor Yellow
$waited = 0
while (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue) {
  Start-Sleep -Milliseconds 500
  $waited += 0.5
  if ($waited -gt 30) {
    Write-Host "  等待超时(30秒)，尝试继续安装..." -ForegroundColor DarkYellow
    break
  }
}
Start-Sleep -Milliseconds 800
Write-Host "  应用已退出" -ForegroundColor Green

# [2/4] 复制新版本文件（带重试，处理文件占用）
Write-Host "[2/4] 正在安装新版本文件..." -ForegroundColor Yellow
$copied = $false
$retries = 0
$maxRetry = 8
while (-not $copied -and $retries -lt $maxRetry) {
  try {
    Copy-Item -LiteralPath $Src -Destination $Dst -Force -ErrorAction Stop
    $copied = $true
    Write-Host "  文件安装完成" -ForegroundColor Green
  } catch {
    $retries++
    Write-Host ("  第 {0} 次尝试失败: {1}" -f $retries, $_.Exception.Message) -ForegroundColor DarkYellow
    if ($retries -lt $maxRetry) {
      Start-Sleep -Seconds 1
    }
  }
}

if (-not $copied) {
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Red
  Write-Host "  更新安装失败" -ForegroundColor Red
  Write-Host "  原因: 无法替换程序文件(可能被占用)" -ForegroundColor Red
  Write-Host ("  新版本文件位置: " + $Src) -ForegroundColor Yellow
  Write-Host "  请手动关闭书签管理器后重试" -ForegroundColor Yellow
  Write-Host "========================================" -ForegroundColor Red
  Write-Host ""
  Write-Host "按任意键关闭此窗口..." -ForegroundColor Gray
  try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch { Start-Sleep -Seconds 10 }
  exit 1
}

# [3/4] 启动新版本
Write-Host "[3/4] 正在启动新版本..." -ForegroundColor Yellow
try {
  Start-Process -FilePath $Dst
  Write-Host "  新版本已启动" -ForegroundColor Green
} catch {
  Write-Host ("  启动失败: {0}" -f $_.Exception.Message) -ForegroundColor Red
  Write-Host "  请手动启动应用" -ForegroundColor Yellow
}

# [4/4] 清理临时文件
Write-Host "[4/4] 正在清理临时文件..." -ForegroundColor Yellow
try {
  if (Test-Path $Staging) {
    Remove-Item -LiteralPath $Staging -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host "  清理完成" -ForegroundColor Green
} catch {
  Write-Host "  清理失败(不影响更新)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  更新安装完成! 新版本已启动" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2
exit 0
`
}

// ============================================================
// 执行安装：生成 PS1 脚本并 spawn PowerShell 进程
// 返回 { ok, pid } 或抛出异常
// ============================================================
export function spawnInstaller({ pid, downloadedFilePath, currentExePath, stagingDir }) {
  // 参数校验
  if (!pid) throw new Error('缺少进程 PID')
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    throw new Error('下载的更新文件不存在: ' + downloadedFilePath)
  }
  if (!currentExePath) throw new Error('缺少当前程序路径')
  if (!stagingDir) throw new Error('缺少暂存目录')

  // 确保暂存目录存在
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true })
  }

  // 生成 PS1 脚本
  const ps1Path = path.join(stagingDir, 'install-update.ps1')
  const scriptContent = buildInstallScript({ pid, downloadedFilePath, currentExePath, stagingDir })
  // 用 UTF-8 with BOM 写入,确保 PowerShell 正确识别中文
  const bom = '\uFEFF'
  fs.writeFileSync(ps1Path, bom + scriptContent, 'utf8')

  // spawn PowerShell,显示窗口让用户看到安装进度
  const child = spawn('powershell.exe', [
    '-ExecutionPolicy', 'Bypass',
    '-NoProfile',
    '-NoExit',  // 不自动退出,由脚本自己控制(失败时暂停)
    '-File', ps1Path
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false  // 显示窗口,让用户看到进度
  })
  child.unref()

  return { ok: true, pid: child.pid, scriptPath: ps1Path }
}
