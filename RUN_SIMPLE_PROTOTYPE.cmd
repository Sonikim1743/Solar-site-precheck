@echo off
setlocal
cd /d "%~dp0"
set "PROTOTYPE_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "PROTOTYPE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
echo Building the simple design prototype...
"%PROTOTYPE_NODE%" node_modules\vite\bin\vite.js build --configLoader runner --outDir output/simple-prototype-dist
if errorlevel 1 goto failed
echo Open http://127.0.0.1:5186/?design=simple^&prototype=1
echo Keep this window open while testing. Ctrl+C stops the server.
"%PROTOTYPE_NODE%" node_modules\vite\bin\vite.js preview --configLoader runner --outDir output/simple-prototype-dist --host 127.0.0.1 --port 5186 --strictPort
if errorlevel 1 goto failed
exit /b 0
:failed
echo Could not start. If port 5186 is already in use, open the URL above.
pause
exit /b 1
