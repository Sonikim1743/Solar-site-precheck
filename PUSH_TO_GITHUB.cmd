@echo off
cd /d "%~dp0"

echo.
echo Upload Solar Site Precheck to GitHub.
echo Repository:
echo https://github.com/Sonikim1743/Solar-site-precheck.git
echo.
echo If a GitHub login window appears, please sign in with your browser.
echo.

git status --short
echo.
git push -u origin main

echo.
echo Done. If an error appears, copy this window text and send it to Codex.
pause
