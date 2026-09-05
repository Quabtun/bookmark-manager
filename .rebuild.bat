@echo off
chcp 65001 >nul
cd /d "D:\code\Trae\书签管理器\bookmark-manager"

echo === rebuild log start === > "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"

echo. >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"
echo [1/3] Cleaning old artifacts >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"
for %%P in (release7 dist dist-electron) do (
  if exist "%%P" (
    rd /s /q "%%P" >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log" 2>&1
    echo   removed %%P >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"
  )
)

echo. >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"
echo [2/3] Killing stale processes >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"
taskkill /IM electron-builder.exe /F >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log" 2>&1
taskkill /IM BookmarkManager.exe /F >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log" 2>&1

echo. >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"
echo [3/3] Running npm run build >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"
call npm run build >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log" 2>&1
set "RC=%ERRORLEVEL%"
echo. >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"
echo === build exit code: %RC% >> "D:\code\Trae\书签管理器\bookmark-manager\rebuild.log"
echo done > "D:\code\Trae\书签管理器\bookmark-manager\.rebuild.done"
exit /b %RC%
