@echo off
setlocal
cd /d "%~dp0"
set "PORT=5173"
set "HOST=127.0.0.1"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
echo Solar Site Precheck latest preview:
echo http://127.0.0.1:5173/
echo.
echo Keep this window open while using the app.
echo.
"%NODE_EXE%" "%~dp0work\serve-dist.mjs"
echo.
echo Server stopped.
pause
