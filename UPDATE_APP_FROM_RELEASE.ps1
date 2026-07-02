param(
  [string]$VersionUrl = "https://github.com/Sonikim1743/Solar-site-precheck/releases/latest/download/latest-version.json"
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host ""
  Write-Host "== $message =="
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tempRoot = Join-Path $root "_update_tmp"
$downloadZip = Join-Path $tempRoot "latest.zip"
$extractDir = Join-Path $tempRoot "extract"
$backupRoot = Join-Path $root "backup"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $backupRoot "backup_$timestamp"

Write-Step "Checking latest release"
$meta = Invoke-RestMethod -Uri $VersionUrl -UseBasicParsing

if (-not $meta.zipUrl) {
  throw "latest-version.json does not contain zipUrl."
}

Write-Host "Version : $($meta.version)"
Write-Host "Build   : $($meta.buildDate)"
Write-Host "Package : $($meta.packageName)"
Write-Host "URL     : $($meta.zipUrl)"

Write-Step "Preparing update folder"
if (Test-Path $tempRoot) {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null
New-Item -ItemType Directory -Path $extractDir | Out-Null
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

Write-Step "Downloading latest zip"
Invoke-WebRequest -Uri $meta.zipUrl -OutFile $downloadZip -UseBasicParsing

if (-not (Test-Path $downloadZip)) {
  throw "Download failed."
}

$downloadedSize = (Get-Item $downloadZip).Length
Write-Host "Downloaded: $downloadedSize bytes"

Write-Step "Extracting zip"
Expand-Archive -LiteralPath $downloadZip -DestinationPath $extractDir -Force

$newDist = Join-Path $extractDir "dist"
$newWork = Join-Path $extractDir "work"
$newRun = Join-Path $extractDir "RUN_PORTABLE.cmd"
$newUpdateCmd = Join-Path $extractDir "UPDATE_APP_FROM_RELEASE.cmd"
$newUpdatePs1 = Join-Path $extractDir "UPDATE_APP_FROM_RELEASE.ps1"

if (-not (Test-Path (Join-Path $newDist "index.html"))) {
  throw "Invalid update package: dist/index.html was not found."
}
if (-not (Test-Path (Join-Path $newWork "serve-dist.mjs"))) {
  throw "Invalid update package: work/serve-dist.mjs was not found."
}

Write-Step "Backing up current app"
New-Item -ItemType Directory -Path $backupDir | Out-Null
foreach ($name in @("dist", "work", "RUN_PORTABLE.cmd", "UPDATE_APP_FROM_RELEASE.cmd", "UPDATE_APP_FROM_RELEASE.ps1")) {
  $source = Join-Path $root $name
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination $backupDir -Recurse -Force
  }
}
Write-Host "Backup: $backupDir"

Write-Step "Applying update"
foreach ($name in @("dist", "work")) {
  $target = Join-Path $root $name
  if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

Copy-Item -LiteralPath $newDist -Destination (Join-Path $root "dist") -Recurse -Force
Copy-Item -LiteralPath $newWork -Destination (Join-Path $root "work") -Recurse -Force
if (Test-Path $newRun) {
  Copy-Item -LiteralPath $newRun -Destination (Join-Path $root "RUN_PORTABLE.cmd") -Force
}
if (Test-Path $newUpdateCmd) {
  Copy-Item -LiteralPath $newUpdateCmd -Destination (Join-Path $root "UPDATE_APP_FROM_RELEASE.cmd") -Force
}
if (Test-Path $newUpdatePs1) {
  Copy-Item -LiteralPath $newUpdatePs1 -Destination (Join-Path $root "UPDATE_APP_FROM_RELEASE.ps1") -Force
}

$status = [ordered]@{
  version = $meta.version
  buildDate = $meta.buildDate
  packageName = $meta.packageName
  updatedAt = (Get-Date).ToString("s")
  backup = $backupDir
}
$status | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $root "update-status.json") -Encoding UTF8

Write-Step "Cleaning temporary files"
Remove-Item -LiteralPath $tempRoot -Recurse -Force

Write-Step "Update complete"
Write-Host "Please close the old server window if it is still running, then start RUN_PORTABLE.cmd again."
Write-Host "If anything goes wrong, restore files from:"
Write-Host $backupDir
