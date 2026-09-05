@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo === cleanup ===
rd /s /q release7 2>nul
rd /s /q dist 2>nul
rd /s /q dist-electron 2>nul

echo === build ===
call npm run build
set "RC=%ERRORLEVEL%"
echo === build rc=%RC% ===
exit /b %RC%
