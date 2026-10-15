$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$env:NODE_ENV = 'development'
$env:PORT = '3000'
$env:DATABASE_MODE = 'pglite'
$env:PGLITE_DATA_DIR = Join-Path $projectRoot 'data\pglite'

$logDirectory = Join-Path $projectRoot 'data\logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory 'local-server.log'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

while ($true) {
  Add-Content -Path $logPath -Value "`n[$(Get-Date -Format o)] Starting AgriConnect on localhost:3000"
  & $nodePath 'src\server.js' *>> $logPath
  $exitCode = $LASTEXITCODE
  Add-Content -Path $logPath -Value "[$(Get-Date -Format o)] AgriConnect exited with code $exitCode"

  if ($exitCode -eq 0) {
    exit 0
  }

  Start-Sleep -Seconds 5
}
