param(
  [switch]$RefreshCatalog
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$rawAircon = Join-Path $projectRoot "raw\aircon"
$rawMsis = Join-Path $projectRoot "raw\msis"
$rawReference = Join-Path $projectRoot "raw\reference"
$configDir = Join-Path $projectRoot "config"
$publicDir = Join-Path $projectRoot "public"
$reportsDir = Join-Path $publicDir "reports"

$codexRoot = Split-Path -Parent $projectRoot
$airconRoot = Join-Path $codexRoot "aircon-unified-generator"
$msisRoot = Join-Path $codexRoot "lg-msis-html-report"

$python = "C:\Users\82105\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$node = "C:\Program Files\nodejs\node.exe"
$msisPython = "C:\Python314\python.exe"

function Write-Section([string]$text) {
  Write-Host ""
  Write-Host "============================================================"
  Write-Host " $text"
  Write-Host "============================================================"
}

function Invoke-Checked([string]$title, [scriptblock]$body) {
  Write-Host ""
  Write-Host "[$title]" -ForegroundColor Cyan
  & $body
  if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
    throw "$title failed. Exit code: $LASTEXITCODE"
  }
}

function Get-LatestFile($dir, [string[]]$extensions) {
  if (-not (Test-Path -LiteralPath $dir)) { return $null }
  Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
    Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Sync-AirconConfig {
  $sourceModels = Join-Path $configDir "aircon_models.txt"
  $targetModels = Join-Path $airconRoot "weekly_models.txt"
  $sourceSettings = Join-Path $configDir "aircon_settings.txt"
  $targetSettings = Join-Path $airconRoot "weekly_settings.txt"

  if (-not (Test-Path -LiteralPath $sourceModels)) {
    throw "Missing config file: $sourceModels"
  }

  $modelLines = Get-Content -LiteralPath $sourceModels |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }

  if (@($modelLines).Count -eq 0) {
    throw "No aircon models found in $sourceModels"
  }

  Set-Content -LiteralPath $targetModels -Value $modelLines -Encoding UTF8
  Write-Host "Synced aircon model list: $(@($modelLines).Count) lines"

  if (Test-Path -LiteralPath $sourceSettings) {
    Copy-Item -LiteralPath $sourceSettings -Destination $targetSettings -Force
    Write-Host "Synced aircon settings"
  }
}

function Sync-MsisRawFiles {
  $targetData = Join-Path $msisRoot "DATA"
  New-Item -ItemType Directory -Force -Path $targetData | Out-Null

  $files = Get-ChildItem -LiteralPath $rawMsis -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension.ToLowerInvariant() -in @(".xls", ".xlsx") }

  if (@($files).Count -eq 0) {
    Write-Host "No MSIS raw files found in $rawMsis. Existing DATA folder will be used."
    return
  }

  foreach ($file in $files) {
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $targetData $file.Name) -Force
    Write-Host "Synced MSIS raw file: $($file.Name)"
  }
}

function Get-TvReferenceFile {
  $preferred = Join-Path $rawReference "tv_old_model_reference.xlsx"
  if (Test-Path -LiteralPath $preferred) {
    return Get-Item -LiteralPath $preferred
  }

  return Get-LatestFile $rawReference @(".xlsx", ".xls")
}

function Update-PortalTimestamp {
  $index = Join-Path $publicDir "index.html"
  if (-not (Test-Path -LiteralPath $index)) { return }

  $now = Get-Date -Format "yyyy-MM-dd HH:mm"
  $content = Get-Content -LiteralPath $index -Raw
  $content = [regex]::Replace($content, 'PC 배포용 · [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} 기준', "PC 배포용 · $now 기준")
  Set-Content -LiteralPath $index -Value $content -Encoding UTF8
}

Write-Section "Incheon Team 2 Report Site Build"

if (-not (Test-Path -LiteralPath $airconRoot)) { throw "Missing aircon generator folder: $airconRoot" }
if (-not (Test-Path -LiteralPath $msisRoot)) { throw "Missing MSIS generator folder: $msisRoot" }
if (-not (Test-Path -LiteralPath $python)) { throw "Missing Python runtime: $python" }
if (-not (Test-Path -LiteralPath $node)) { throw "Missing Node runtime: $node" }

New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null

Invoke-Checked "Prepare aircon config" {
  Sync-AirconConfig
}

$airconSource = Get-LatestFile $rawAircon @(".xlsx", ".xls")
$tvReference = Get-TvReferenceFile

Invoke-Checked "Build aircon inventory data" {
  Push-Location $airconRoot
  try {
    if ($tvReference) {
      $env:TV_REFERENCE_PATH = $tvReference.FullName
      Write-Host "Using TV old-stock reference: $($tvReference.FullName)"
    } else {
      Remove-Item Env:\TV_REFERENCE_PATH -ErrorAction SilentlyContinue
      Write-Host "No TV old-stock reference found in $rawReference. Generator fallback will be used."
    }

    if ($airconSource) {
      Write-Host "Using aircon raw file: $($airconSource.FullName)"
      & $python "prepare_inventory_data.py" $airconSource.FullName
    } else {
      Write-Host "No aircon raw file found. Using generator default source lookup."
      & $python "prepare_inventory_data.py"
    }
  } finally {
    Remove-Item Env:\TV_REFERENCE_PATH -ErrorAction SilentlyContinue
    Pop-Location
  }
}

Invoke-Checked "Build aircon map" {
  Push-Location $airconRoot
  try {
    & $python "build_real_map_html.py" (Join-Path $airconRoot "output\aircon_inventory_map.html")
  } finally {
    Pop-Location
  }
}

Invoke-Checked "Build aircon training sheet" {
  Push-Location $airconRoot
  try {
    & $node (Join-Path $airconRoot "make_weekly_aircon_cards.js") (Join-Path $airconRoot "weekly_models.txt") (Join-Path $airconRoot "output")
  } finally {
    Pop-Location
  }
}

Invoke-Checked "Build aircon unified report" {
  Push-Location $airconRoot
  try {
    & $node (Join-Path $airconRoot "build_unified_html.js") (Join-Path $airconRoot "output")
  } finally {
    Pop-Location
  }
}

Invoke-Checked "Prepare MSIS raw files" {
  Sync-MsisRawFiles
}

Invoke-Checked "Build MSIS sales report" {
  Push-Location $msisRoot
  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $msisRoot "output") | Out-Null
    $log = Join-Path $msisRoot "output\last_run_log.txt"
    if (Test-Path -LiteralPath $msisPython) {
      & $msisPython "build_lg_html_report.py" *> $log
    } else {
      & py "build_lg_html_report.py" *> $log
    }
    if ($LASTEXITCODE -ne 0) {
      Get-Content -LiteralPath $log -ErrorAction SilentlyContinue
      throw "MSIS build failed. Check $log"
    }
  } finally {
    Pop-Location
  }
}

Invoke-Checked "Publish generated reports" {
  Copy-Item -LiteralPath (Join-Path $airconRoot "output\aircon_unified_report.html") -Destination (Join-Path $reportsDir "aircon_unified_report.html") -Force
  Copy-Item -LiteralPath (Join-Path $msisRoot "output\lg_sales_competition_subscription_report.html") -Destination (Join-Path $reportsDir "lg_sales_competition_subscription_report.html") -Force
  Update-PortalTimestamp
}

if ($RefreshCatalog) {
  Invoke-Checked "Refresh LG product search DB" {
    Push-Location $projectRoot
    try {
      & $node (Join-Path $projectRoot "scripts\build_lg_catalog.js")
    } finally {
      Pop-Location
    }
  }
} else {
  Write-Host ""
  Write-Host "LG product search DB refresh skipped. Use RUN_BUILD_FULL.cmd to refresh it."
}

Write-Host ""
Write-Host "Build complete." -ForegroundColor Green
Write-Host "Open:"
Write-Host (Join-Path $publicDir "index.html")
