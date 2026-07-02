@echo off
cd /d "%~dp0"

set "VERSION_URL=https://github.com/Sonikim1743/Solar-site-precheck/releases/latest/download/latest-version.json"

echo Solar Site Precheck updater
echo.
echo Version info:
echo %VERSION_URL%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0UPDATE_APP_FROM_RELEASE.ps1" -VersionUrl "%VERSION_URL%"

echo.
pause
