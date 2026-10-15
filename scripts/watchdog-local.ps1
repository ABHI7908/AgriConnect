$ErrorActionPreference = 'Stop'

$dataDirectory = Join-Path $PSScriptRoot '..\data'
$logDirectory = Join-Path $dataDirectory 'logs'
$statePath = Join-Path $dataDirectory 'watchdog-unhealthy-since.txt'
$logPath = Join-Path $logDirectory 'watchdog.log'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

$lastError = $null
try {
  $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/healthz' -UseBasicParsing -TimeoutSec 5
  $health = $response.Content | ConvertFrom-Json
  if ($response.StatusCode -eq 200 -and $health.status -eq 'ok') {
    Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
    exit 0
  }
  $lastError = "Health endpoint returned HTTP $($response.StatusCode) with status '$($health.status)'."
} catch {
  $lastError = $_.Exception.Message
}

if (-not (Test-Path -LiteralPath $statePath)) {
  New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
  Set-Content -LiteralPath $statePath -Value ([DateTimeOffset]::Now.ToString('o'))
}

$storedValue = Get-Content -LiteralPath $statePath -Raw
$unhealthySince = [DateTimeOffset]::MinValue
if (-not [DateTimeOffset]::TryParse($storedValue, [ref]$unhealthySince)) {
  $unhealthySince = [DateTimeOffset]::Now
  Set-Content -LiteralPath $statePath -Value $unhealthySince.ToString('o')
}

$forceRestart = [DateTimeOffset]::Now - $unhealthySince -ge [TimeSpan]::FromMinutes(5)
if ($forceRestart -and (Test-Path -LiteralPath (Join-Path $dataDirectory 'agriconnect-server.pid'))) {
  $launcherArgs = @('scripts\launch-local-server.js', '--force')
} else {
  $launcherArgs = @('scripts\launch-local-server.js')
}

$env:NODE_ENV = 'development'
$env:PORT = '3000'
$env:DATABASE_MODE = 'pglite'
$env:PGLITE_DATA_DIR = Join-Path $projectRoot 'data\pglite'
Push-Location $projectRoot
try {
  & $nodePath @launcherArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Could not launch AgriConnect from the watchdog (Node exit code $LASTEXITCODE)."
  }
} finally {
  Pop-Location
}

Add-Content -Path $logPath -Value "[$(Get-Date -Format o)] Requested AgriConnect launch after failed health check: $lastError"
