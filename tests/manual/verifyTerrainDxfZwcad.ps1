param([string]$Directory = (Join-Path (Get-Location) 'outputs\dxf'))
$ErrorActionPreference = 'Stop'
$folder = [IO.Path]::GetFullPath($Directory)
$evidencePath = Join-Path $folder 'zwcad-verification.json'
$progressPath = Join-Path $folder 'zwcad-progress.txt'
'Connecting to installed ZWCAD 2026 COM API' | Set-Content -LiteralPath $progressPath
$cad = $null
$manifest = Get-Content -LiteralPath (Join-Path $folder 'manifest.json') -Raw | ConvertFrom-Json
$sample = $manifest.samples | Where-Object name -eq 'synthetic-tilt-15-fence-on.dxf'
$source = Join-Path $folder $sample.name
$drawing = $null
try {
  $cad = New-Object -ComObject ZWCAD.Application.2026
  $initialDocuments = $cad.Documents.Count
  'Opening only the synthetic DXF' | Add-Content -LiteralPath $progressPath
  $drawing = $cad.Documents.Open($source, $false)
  $layers = @{}
  $module = $null
  $ruler = $null
  $parcelText = ''
  $nonPlanar = 0
  $objectTypes = @{}
  foreach ($entity in $drawing.ModelSpace) {
    $layer = [string]$entity.Layer
    $kind = [string]$entity.ObjectName
    $layers[$layer] = 1 + $layers[$layer]
    $objectTypes[$kind] = 1 + $objectTypes[$kind]
    if ($layer -eq 'MODULES' -and $null -eq $module) { $module = $entity }
    if ($layer -eq 'REFERENCE' -and $null -eq $ruler -and $kind -match 'Polyline') { $ruler = $entity }
    if ($layer -eq 'PARCEL_TEXT') { $parcelText = [string]$entity.TextString }
    if ($kind -match 'Polyline' -and [math]::Abs([double]$entity.Elevation) -gt 1e-10) { $nonPlanar++ }
  }
  if ($layers.MODULES -ne $sample.moduleCount) { throw 'CAD module count mismatch' }
  if ([math]::Abs([double]$ruler.Length - 50) -gt 1e-8) { throw 'CAD ruler is not 50 metres' }
  if ($parcelText -ne $sample.parcelText) { throw 'CAD Japanese parcel text mismatch' }
  if ($nonPlanar -ne 0) { throw 'CAD non-zero elevation found' }
  $original = [double[]]$module.Coordinates
  $changed = [double[]]$original.Clone()
  $changed[0] += .01
  $module.Coordinates = $changed
  $editable = [math]::Abs(([double[]]$module.Coordinates)[0] - $changed[0]) -lt 1e-9
  $module.Coordinates = $original
  if (-not $editable) { throw 'Native polyline edit test failed' }
  $coordinates = [double[]]$module.Coordinates
  $width = [math]::Sqrt([math]::Pow($coordinates[2]-$coordinates[0],2)+[math]::Pow($coordinates[3]-$coordinates[1],2))
  $projectedHeight = [math]::Sqrt([math]::Pow($coordinates[6]-$coordinates[0],2)+[math]::Pow($coordinates[7]-$coordinates[1],2))
  if ([math]::Abs($width-$sample.moduleWidthM) -gt 1e-8 -or [math]::Abs($projectedHeight-$sample.projectedModuleHeightM) -gt 1e-8) { throw 'CAD module dimensions mismatch' }
  $target = Join-Path $folder 'synthetic-zwcad-verified.dwg'
  if (Test-Path -LiteralPath $target) { throw 'Test DWG already exists; will not overwrite' }
  $drawing.SaveAs($target)
  $layout = $drawing.ActiveLayout
  $layout.RefreshPlotDeviceInfo()
  $devices = @($layout.GetPlotDeviceNames())
  $evidence = [ordered]@{ version = [string]$cad.Version; initialDocumentCount = $initialDocuments; source = $sample.name; savedSyntheticDwg = $target; modules = $layers.MODULES; rulerMetres = [double]$ruler.Length; units = $drawing.GetVariable('INSUNITS'); moduleWidthM = $width; moduleProjectedHeightM = $projectedHeight; nonPlanar = $nonPlanar; parcelText = $parcelText; editablePolyline = $editable; restoredAfterEdit = $true; layers = $layers; objectTypes = $objectTypes; plotDevices = $devices; physicalPrint = $false; previewVerified = $false }
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidencePath -Encoding utf8
  'Native CAD checks passed; no physical print submitted' | Add-Content -LiteralPath $progressPath
  $evidence | ConvertTo-Json -Depth 8
} catch {
  ('ERROR: ' + $_.Exception.Message) | Add-Content -LiteralPath $progressPath
  @{ verified = $false; error = $_.Exception.Message; hresult = ('0x{0:X8}' -f $_.Exception.HResult); physicalPrint = $false } | ConvertTo-Json | Set-Content -LiteralPath $evidencePath -Encoding utf8
  throw
} finally {
  # Only this generated test drawing belongs to this script. Existing documents
  # and the running application are neither closed nor changed.
  if ($null -ne $drawing) { $drawing.Close($false) }
}
