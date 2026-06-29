@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE="
set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%CODEX_NODE%" set "NODE_EXE=%CODEX_NODE%"
if not defined NODE_EXE (
  where node >nul 2>&1
  if not errorlevel 1 set "NODE_EXE=node"
)

if not defined NODE_EXE (
  echo Node.js was not found.
  echo Install the current Node.js LTS version, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Application packages are missing.
  echo Open this project in Codex once, or run npm install before sharing.
  pause
  exit /b 1
)

echo Building Solar Site Precheck...
"%NODE_EXE%" node_modules\vite\bin\vite.js build --configLoader runner
if errorlevel 1 goto :error

echo.
echo ============================================================
echo Team members must NOT use 127.0.0.1.
echo Open the following address from a PC on the same Wi-Fi/LAN:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  for /f "tokens=*" %%B in ("%%A") do echo   http://%%B:5173/
)
echo ============================================================
echo.
echo Keep this window open while the team is using the application.
set "HOST=0.0.0.0"
set "PORT=5173"
"%NODE_EXE%" work\serve-dist.mjs
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo The server could not be started. Check the message above.
pause
exit /b 1
