@echo off
chcp 65001 >nul
REM ==========================================
REM  书签管理器 — 首次安装脚本
REM ==========================================
cd /d "%~dp0"

echo [1/2] 安装项目依赖（使用国内镜像）...
call pnpm install --ignore-scripts
if %errorlevel% neq 0 (
    echo pnpm 安装失败，尝试 npm...
    call npm install --ignore-scripts
)

echo.
echo [2/2] 检查 electron 运行时...
set "ELECTRON=node_modules\electron\dist\electron.exe"
if exist "%ELECTRON%" (
    echo ✅ electron 就绪，可以直接运行 run.bat
    goto :done
)

echo ⚠️  electron 二进制未下载。
echo.
echo 请手动下载 electron 并解压：
echo   1. 打开 https://npmmirror.com/mirrors/electron/v30.5.1/electron-v30.5.1-win32-x64.zip
echo   2. 下载 zip 文件
echo   3. 解压到 node_modules\electron\dist\ 目录
echo   4. 确保 node_modules\electron\dist\electron.exe 存在
echo   5. 双击 run.bat 启动

:done
echo.
pause
