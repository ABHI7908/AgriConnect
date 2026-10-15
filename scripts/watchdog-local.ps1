$ErrorActionPreference = 'Stop'

$taskName = 'AgriConnect Local Server'
$dataDirectory = Join-Path $PSScriptRoot '..\data'
$logDirectory = Join-Path $dataDirectory 'logs'
$statePath = Join-Path $dataDirectory 'watchdog-unhealthy-since.txt'
$logPath = Join-Path $logDirectory 'watchdog.log'

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

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.State -eq 'Running') {
  $unhealthySince = $null
  if (Test-Path -LiteralPath $statePath) {
    $storedValue = Get-Content -LiteralPath $statePath -Raw
    $parsedValue = [DateTimeOffset]::MinValue
    if ([DateTimeOffset]::TryParse($storedValue, [ref]$parsedValue)) {
      $unhealthySince = $parsedValue
    }
  }

  if ($null -eq $unhealthySince) {
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    Set-Content -LiteralPath $statePath -Value [DateTimeOffset]::Now.ToString('o')
    exit 0
  }

  if ([DateTimeOffset]::Now - $unhealthySince -lt [TimeSpan]::FromMinutes(5)) {
    exit 0
  }

  Stop-ScheduledTask -TaskName $taskName
  $deadline = (Get-Date).AddSeconds(15)
  do {
    Start-Sleep -Seconds 1
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  } while ($task.State -eq 'Running' -and (Get-Date) -lt $deadline)

  if ($task.State -eq 'Running') {
    throw "Could not stop the unhealthy AgriConnect server task."
  }
}

Start-ScheduledTask -TaskName $taskName

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
Add-Content -Path $logPath -Value "[$(Get-Date -Format o)] Started AgriConnect after failed health check: $lastError"
