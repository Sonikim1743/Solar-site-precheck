@echo off
cd /d "%~dp0"

set "NODE_EXE="

if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

if "%NODE_EXE%"=="" (
  for /f "delims=" %%N in ('where node 2^>nul') do (
    set "NODE_EXE=%%N"
    goto :node_found
  )
)

:node_found
if "%NODE_EXE%"=="" (
  echo Node.js was not found.
  echo.
  echo Please install Node.js 20.19 or later, or run this app from Codex Desktop once.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo dist/index.html was not found.
  echo This portable package is incomplete.
  echo Please create it again with MAKE_PORTABLE_PACKAGE.cmd.
  echo.
  pause
  exit /b 1
)

if not exist "work\serve-dist.mjs" (
  echo work/serve-dist.mjs was not found.
  echo This portable package is incomplete.
  echo.
  pause
  exit /b 1
)

echo Solar Site Precheck portable app is starting.
echo Keep this black window open while using the app.
echo.
echo Open this URL in the browser:
echo http://127.0.0.1:5173/
echo.
"%NODE_EXE%" "work\serve-dist.mjs"
echo.
echo Server stopped.
pause
