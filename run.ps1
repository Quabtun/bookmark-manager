# 书签管理器 — PowerShell 启动脚本
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$electron = Join-Path $projectDir "node_modules\electron\dist\electron.exe"

if (Test-Path $electron) {
    Write-Host "正在启动书签管理器..." -ForegroundColor Cyan
    Start-Process -FilePath $electron -ArgumentList $projectDir
} else {
    Write-Host "[错误] 找不到 electron.exe" -ForegroundColor Red
    Write-Host "请先运行: pnpm install --ignore-scripts" -ForegroundColor Yellow
    Read-Host "按 Enter 退出"
}
