@echo off
setlocal enabledelayedexpansion

REM Get the directory where this batch file is located (without trailing backslash)
set "PROJ_DIR=%~dp0"
if "%PROJ_DIR:~-1%"=="\" set "PROJ_DIR=%PROJ_DIR:~0,-1%"

set "ELECTRON=%PROJ_DIR%\node_modules\electron\dist\electron.exe"

if exist "%ELECTRON%" (
    REM Use /D to set working directory for the new process
    start "" /D "%PROJ_DIR%" "%ELECTRON%" "%PROJ_DIR%"
    exit /b 0
)

echo [ERROR] electron.exe not found at: %ELECTRON%
echo Run: node copy-electron.cjs
pause
exit /b 1
