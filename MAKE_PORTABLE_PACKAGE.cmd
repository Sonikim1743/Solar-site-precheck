@echo off
cd /d "%~dp0"

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "PACKAGE_DIR=outputs\SolarSitePrecheck_Portable"
set "PACKAGE_ZIP=outputs\SolarSitePrecheck_v1.1_portable.zip"

if not exist "%NODE_EXE%" (
  echo Bundled Node was not found.
  echo Please run this from the Codex Desktop environment, or install Node.js and build manually.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo node_modules was not found.
  echo Please run npm install first in this project folder.
  echo.
  pause
  exit /b 1
)

echo Building app...
"%NODE_EXE%" "node_modules\vite\bin\vite.js" build --configLoader runner
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo Preparing portable folder...
if exist "%PACKAGE_DIR%" rmdir /s /q "%PACKAGE_DIR%"
mkdir "%PACKAGE_DIR%"
mkdir "%PACKAGE_DIR%\work"

xcopy "dist" "%PACKAGE_DIR%\dist" /e /i /y >nul
copy "work\serve-dist.mjs" "%PACKAGE_DIR%\work\serve-dist.mjs" >nul
copy "RUN_PORTABLE.cmd" "%PACKAGE_DIR%\RUN_PORTABLE.cmd" >nul

(
  echo Solar Site Precheck Portable
  echo.
  echo 1. Copy this whole folder to another Windows PC.
  echo 2. Double-click RUN_PORTABLE.cmd.
  echo 3. Open http://127.0.0.1:5173/ in the browser.
  echo.
  echo If Node.js is not found, install Node.js 20.19 or later:
  echo https://nodejs.org/
  echo.
  echo This package contains built app files only. It does not contain source code or node_modules.
) > "%PACKAGE_DIR%\README_PORTABLE.txt"

echo Creating zip...
if exist "%PACKAGE_ZIP%" del "%PACKAGE_ZIP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%PACKAGE_DIR%\*' -DestinationPath '%PACKAGE_ZIP%' -Force"
if errorlevel 1 (
  echo.
  echo Zip creation failed. You can still copy this folder:
  echo %PACKAGE_DIR%
  pause
  exit /b 1
)

echo.
echo Portable package created:
echo %PACKAGE_ZIP%
echo.
echo Copy this zip to the home PC, extract it, and run RUN_PORTABLE.cmd.
echo.
pause
