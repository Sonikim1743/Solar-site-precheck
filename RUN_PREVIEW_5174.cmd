@echo off
setlocal
cd /d "%~dp0"
set "PORT=5174"
set "HOST=127.0.0.1"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
  echo Node.js runtime was not found:
  echo %NODE_EXE%
  echo.
  echo Codex Desktop bundled runtime was not found.
  pause
  exit /b 1
)

echo Solar Site Precheck preview:
echo http://127.0.0.1:5174/
echo.
"%NODE_EXE%" "%~dp0work\serve-dist.mjs"
