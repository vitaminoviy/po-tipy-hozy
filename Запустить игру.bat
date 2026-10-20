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
  echo Не найден Node.js. Установите Node.js 22 или новее с https://nodejs.org/ и повторите запуск.
  pause
  popd
  exit /b 1
)
where.exe pnpm >nul 2>&1
if errorlevel 1 (
  echo Не найден pnpm. После установки Node.js выполните: npm install -g pnpm@11.25.0
  pause
  popd
  exit /b 1
)
node "%~dp0scripts\launch-game.mjs" --open-browser %*
set "GAME_EXIT=%ERRORLEVEL%"
if not "%GAME_EXIT%"=="0" pause
popd
exit /b %GAME_EXIT%
