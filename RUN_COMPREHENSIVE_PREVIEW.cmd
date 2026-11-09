@echo off
setlocal
cd /d "%~dp0"
set "HOST=127.0.0.1"
set "PORT=5187"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
if not exist "dist\index.html" (
  echo Build is missing. Run pnpm install --frozen-lockfile and pnpm build first.
  pause
  exit /b 1
)
echo Review preview: http://127.0.0.1:5187/
echo This preview uses its own browser storage. The production app is unchanged.
echo Keep this window open while trying the app. Close it to stop the preview.
"%NODE_EXE%" "work\serve-dist.mjs"
pause
