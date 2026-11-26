@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "release\LuminaRead-win32-x64\LuminaRead.exe" (
  start "" "release\LuminaRead-win32-x64\LuminaRead.exe"
  exit /b 0
)
if exist "node_modules\.bin\electron.cmd" (
  start "" "node_modules\.bin\electron.cmd" .
  exit /b 0
)
title LuminaRead 流光精读
echo 未检测到打包客户端，正在以本地 Web 模式启动 (http://localhost:3456)...
node server/index.js --open
pause
