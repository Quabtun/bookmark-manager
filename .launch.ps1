$ErrorActionPreference = 'Stop'

# 复制 bat 到 ASCII 路径，从这里启动
$srcBat = 'D:\code\Trae\书签管理器\bookmark-manager\.build-new.bat'
$tmpDir = 'C:\Users\22145\AppData\Local\Temp\bm-build'
$tmpBat = Join-Path $tmpDir 'build.bat'

if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null }

# 把 bat 内容复制过来，把内置的中文路径替换掉（bat 第一行改成指定 path）
$content = Get-Content -LiteralPath $srcBat -Raw -Encoding UTF8
$content | Set-Content -LiteralPath $tmpBat -Encoding ASCII -Force

$logPath = Join-Path $tmpDir 'build.log'
if (Test-Path $logPath) { Remove-Item -Force $logPath }

Write-Host "tmp bat: $tmpBat"
Write-Host "log: $logPath"

$proc = Start-Process -FilePath $tmpBat `
  -RedirectStandardOutput $logPath `
  -RedirectStandardError "$logPath.err" `
  -WindowStyle Hidden `
  -PassThru `
  -Wait:$false

Write-Host "PID = $($proc.Id)"
