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

if not exist "node_modules\vite\bin\vite.js" (
  echo node_modules was not found.
  echo Dependencies must be installed before building the app.
  echo.
  pause
  exit /b 1
)

echo Building Solar Site Precheck...
"%NODE_EXE%" "node_modules\vite\bin\vite.js" build --configLoader runner
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Build finished. Starting local server.
echo Keep this black window open while using the app.
echo.
echo Open this URL in the browser:
echo http://127.0.0.1:5173/
echo.
"%NODE_EXE%" "work\serve-dist.mjs"
echo.
echo Server stopped.
pause
