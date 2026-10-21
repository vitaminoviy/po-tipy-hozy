@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 (
  echo Не удалось открыть папку проекта.
  pause
  exit /b 1
)
where.exe node.exe >nul 2>&1
if errorlevel 1 (
  echo Не найден Node.js. Установите Node.js 22 или новее.
  pause
  popd
  exit /b 1
)
node "%~dp0scripts\stop-game.mjs" %*
set "GAME_EXIT=%ERRORLEVEL%"
if /i not "%~1"=="--no-pause" pause
popd
exit /b %GAME_EXIT%
