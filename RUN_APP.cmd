@echo off
cd /d "%~dp0"

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
  echo Bundled Node was not found.
  echo Please install Node.js or run this app from the Codex environment.
  echo.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo dist/index.html was not found.
  echo Run start-local-server.cmd once to build the app.
  echo.
  pause
  exit /b 1
)

echo Solar Site Precheck is starting.
echo Keep this black window open while using the app.
echo.
echo Open this URL in the browser:
echo http://127.0.0.1:5173/
echo.
"%NODE_EXE%" "work\serve-dist.mjs"
echo.
echo Server stopped.
pause
