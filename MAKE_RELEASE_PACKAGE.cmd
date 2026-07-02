@echo off
cd /d "%~dp0"

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "VERSION=1.1"
set "BUILD_DATE="
set "PACKAGE_DIR=outputs\SolarSitePrecheck_Release_Light"
set "PACKAGE_ZIP=outputs\SolarSitePrecheck_v%VERSION%_release_light.zip"
set "VERSION_JSON=outputs\latest-version.json"
set "ZIP_NAME=SolarSitePrecheck_v%VERSION%_release_light.zip"
set "RELEASE_BASE_URL=https://raw.githubusercontent.com/Sonikim1743/Solar-site-precheck/main/release/latest"

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

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "BUILD_DATE=%%i"

echo Building release app...
set "VITE_BUILD_DATE=%BUILD_DATE%"
set "VITE_DISABLE_SW=1"
"%NODE_EXE%" "node_modules\vite\bin\vite.js" build --configLoader runner
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo Preparing lightweight release folder...
if exist "%PACKAGE_DIR%" rmdir /s /q "%PACKAGE_DIR%"
mkdir "%PACKAGE_DIR%"
mkdir "%PACKAGE_DIR%\work"

xcopy "dist" "%PACKAGE_DIR%\dist" /e /i /y >nul
if exist "%PACKAGE_DIR%\dist\templates" rmdir /s /q "%PACKAGE_DIR%\dist\templates"
if exist "%PACKAGE_DIR%\dist\sw.js" del "%PACKAGE_DIR%\dist\sw.js"
copy "work\serve-dist.mjs" "%PACKAGE_DIR%\work\serve-dist.mjs" >nul
copy "RUN_PORTABLE.cmd" "%PACKAGE_DIR%\RUN_PORTABLE.cmd" >nul
copy "UPDATE_APP_FROM_RELEASE.cmd" "%PACKAGE_DIR%\UPDATE_APP_FROM_RELEASE.cmd" >nul
copy "UPDATE_APP_FROM_RELEASE.ps1" "%PACKAGE_DIR%\UPDATE_APP_FROM_RELEASE.ps1" >nul

(
  echo Solar Site Precheck Release Light
  echo.
  echo This package is for online update distribution.
  echo It does not include node.exe, source code, node_modules, Service Worker, or internal .spt templates.
  echo.
  echo Existing desktop installations should keep their runtime\node.exe or installed Node.js.
  echo.
  echo To update this app later, run UPDATE_APP_FROM_RELEASE.cmd.
) > "%PACKAGE_DIR%\README_RELEASE_LIGHT.txt"

echo Creating lightweight zip...
if exist "%PACKAGE_ZIP%" del "%PACKAGE_ZIP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%PACKAGE_DIR%\*' -DestinationPath '%PACKAGE_ZIP%' -Force"
if errorlevel 1 (
  echo.
  echo Zip creation failed.
  pause
  exit /b 1
)

echo Creating latest-version.json...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$zip = Get-Item '%PACKAGE_ZIP%'; $meta = [ordered]@{ app='Solar Site Precheck'; version='%VERSION%'; buildDate='%BUILD_DATE%'; packageName='%ZIP_NAME%'; zipUrl='%RELEASE_BASE_URL%/%ZIP_NAME%'; notes='Light update package. Keep existing runtime/node.exe on desktop.'; sizeBytes=$zip.Length }; $meta | ConvertTo-Json -Depth 5 | Set-Content -Path '%VERSION_JSON%' -Encoding UTF8"

echo Copying release files to release\latest...
if not exist "release\latest" mkdir "release\latest"
copy "%PACKAGE_ZIP%" "release\latest\%ZIP_NAME%" >nul
copy "%VERSION_JSON%" "release\latest\latest-version.json" >nul

echo.
echo Release package created:
echo %PACKAGE_ZIP%
echo.
echo Version metadata created:
echo %VERSION_JSON%
echo.
echo Commit and push these files for online update:
echo - %ZIP_NAME%
echo - latest-version.json
echo.
pause
