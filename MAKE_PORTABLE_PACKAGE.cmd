@echo off
cd /d "%~dp0"

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "PACKAGE_DIR=outputs\SolarSitePrecheck_Portable"
set "PACKAGE_ZIP=outputs\SolarSitePrecheck_v1.22_portable.zip"

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

echo Checking source tree...
"%NODE_EXE%" "work\assert-clean-tree.mjs"
if errorlevel 1 (
  echo.
  echo Portable packaging stopped.
  pause
  exit /b 1
)

echo Building app...
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "VITE_BUILD_DATE=%%i"
set "VITE_DISABLE_SW=1"
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
mkdir "%PACKAGE_DIR%\work\pdfjs"
mkdir "%PACKAGE_DIR%\runtime"

xcopy "dist" "%PACKAGE_DIR%\dist" /e /i /y >nul
if exist "%PACKAGE_DIR%\dist\templates" rmdir /s /q "%PACKAGE_DIR%\dist\templates"
if exist "%PACKAGE_DIR%\dist\sw.js" del "%PACKAGE_DIR%\dist\sw.js"
copy "work\serve-dist.mjs" "%PACKAGE_DIR%\work\serve-dist.mjs" >nul
copy "work\inheritance-server.mjs" "%PACKAGE_DIR%\work\inheritance-server.mjs" >nul
copy "node_modules\pdfjs-dist\legacy\build\pdf.mjs" "%PACKAGE_DIR%\work\pdfjs\pdf.mjs" >nul
copy "node_modules\pdfjs-dist\legacy\build\pdf.worker.mjs" "%PACKAGE_DIR%\work\pdfjs\pdf.worker.mjs" >nul
copy "RUN_PORTABLE.cmd" "%PACKAGE_DIR%\RUN_PORTABLE.cmd" >nul
copy "%NODE_EXE%" "%PACKAGE_DIR%\runtime\node.exe" >nul

(
  echo Solar Site Precheck Portable
  echo.
  echo 1. Copy this whole folder to another Windows PC.
  echo 2. Double-click RUN_PORTABLE.cmd.
  echo 3. Open http://127.0.0.1:5173/ in the browser.
  echo.
  echo A portable node.exe is included in this package.
  echo.
  echo This package contains built app files and node.exe only. It does not contain source code, node_modules, or internal .spt templates.
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
