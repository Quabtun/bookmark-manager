[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$ErrorActionPreference = 'Stop'

# 用 NTFS 短名 8.3 作为兜底（如果开启），否则用 chcp + UTF-8 直接访问中文路径
$proj = 'D:\code\Trae\书签管理器\bookmark-manager'
Write-Host "工作目录: $proj" -ForegroundColor DarkGray

# 测试是否能进入
if (-not (Test-Path -LiteralPath $proj)) {
  Write-Host "路径不可访问，尝试用 chcp 切换 + UTF-8" -ForegroundColor Red
  exit 1
}
Set-Location -LiteralPath $proj

Write-Host '=== 1. 清理旧产物 ===' -ForegroundColor Cyan
foreach ($p in @('release7', 'dist', 'dist-electron')) {
  if (Test-Path -LiteralPath $p) {
    Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
    Write-Host "  - 已删除 $p"
  } else {
    Write-Host "  - $p 不存在，跳过"
  }
}

Write-Host "`n=== 2. 关闭 electron-builder 后台进程 ===" -ForegroundColor Cyan
Get-Process electron-builder, 'BookmarkManager.exe' -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "  - 终止 PID $($_.Id) ($($_.Name))"
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "`n=== 3. 调用 npm run build ===" -ForegroundColor Cyan
& npm run build
$code = $LASTEXITCODE
Write-Host "`n=== build 退出码：$code ===" -ForegroundColor $(if ($code -eq 0) { 'Green' } else { 'Red' })
exit $code
