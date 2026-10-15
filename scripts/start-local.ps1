$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$env:NODE_ENV = 'development'
$env:PORT = '3000'
$env:DATABASE_MODE = 'pglite'
$env:PGLITE_DATA_DIR = Join-Path $projectRoot 'data\pglite'

$logDirectory = Join-Path $projectRoot 'data\logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

function Test-AgriConnectHealth {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/healthz' -UseBasicParsing -TimeoutSec 3
    $health = $response.Content | ConvertFrom-Json
    return $response.StatusCode -eq 200 -and $health.status -eq 'ok'
  } catch {
    return $false
  }
}

$deadline = (Get-Date).AddMinutes(4)
while ((Get-Date) -lt $deadline) {
  if (Test-AgriConnectHealth) {
    exit 0
  }

  & $nodePath (Join-Path $PSScriptRoot 'launch-local-server.js')
  if ($LASTEXITCODE -ne 0) {
    throw "Could not launch the AgriConnect server (Node exit code $LASTEXITCODE)."
  }

  while ((Get-Date) -lt $deadline) {
    if (Test-AgriConnectHealth) {
      exit 0
    }
    Start-Sleep -Seconds 3
  }

  throw "AgriConnect did not become healthy within four minutes. Check data\logs\local-server.log."
}

throw "AgriConnect did not become healthy within four minutes. Check data\logs\local-server.log."
