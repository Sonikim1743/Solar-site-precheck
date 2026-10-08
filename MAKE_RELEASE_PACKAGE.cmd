@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 (
  echo The project folder could not be opened.
  echo.
  pause
  exit /b 1
)

set "RELEASE_NODE_EXE="
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "RELEASE_NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if "%RELEASE_NODE_EXE%"=="" (
  for /f "delims=" %%N in ('where node 2^>nul') do (
    set "RELEASE_NODE_EXE=%%N"
    goto :release_node_found
  )
)

:release_node_found
if "%RELEASE_NODE_EXE%"=="" (
  echo Node.js was not found.
  echo Please run this from Codex Desktop, or install a Node.js version supported by this project.
  echo.
  pause
  exit /b 1
)
if not exist "package.json" (
  echo package.json was not found. Run this script from the source project.
  echo.
  pause
  exit /b 1
)
if not exist "build\packageDeployment.js" (
  echo build/packageDeployment.js was not found. The source project is incomplete.
  echo.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Project dependencies were not found.
  echo Please run pnpm install --frozen-lockfile in this project folder first.
  echo.
  pause
  exit /b 1
)
if not exist "node_modules\fflate\package.json" (
  echo Project dependencies are incomplete.
  echo Please run pnpm install --frozen-lockfile in this project folder first.
  echo.
  pause
  exit /b 1
)

rem Use bundled Git when it is not on PATH; changes apply only to this wrapper.
where git >nul 2>&1
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe" (
    set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd;%PATH%"
  )
)

rem The canonical packager reads package.json and requires committed, clean source.
rem It runs all tests, both target builds, verifyBrowserAssets.js, CSP and ZIP checks.
rem release/latest is updated only after both packages have passed verification.
echo Creating verified Cloudflare and portable release packages...
"%RELEASE_NODE_EXE%" "build\packageDeployment.js"
set "RELEASE_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%RELEASE_EXIT_CODE%"=="0" (
  echo Release packaging stopped. Review the error above before trying again.
) else (
  echo Release packages and metadata were created by build/packageDeployment.js.
)
echo.
pause
exit /b %RELEASE_EXIT_CODE%
