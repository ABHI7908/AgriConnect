$ErrorActionPreference = 'Stop'

$taskName = 'AgriConnect Local Server'
$reachable = $false
$lastError = 'Health endpoint did not return status ok.'

for ($attempt = 1; $attempt -le 3; $attempt += 1) {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/healthz' -UseBasicParsing -TimeoutSec 5
    $health = $response.Content | ConvertFrom-Json
    $reachable = $response.StatusCode -eq 200 -and $health.status -eq 'ok'
    if ($reachable) {
      exit 0
    }
    $lastError = "Health endpoint returned HTTP $($response.StatusCode) with status '$($health.status)'."
  } catch {
    $lastError = $_.Exception.Message
  }

  if ($attempt -lt 3) {
    Start-Sleep -Seconds 5
  }
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.State -eq 'Running') {
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

$logDirectory = Join-Path $PSScriptRoot '..\data\logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Add-Content -Path (Join-Path $logDirectory 'watchdog.log') -Value "[$(Get-Date -Format o)] Restarted AgriConnect after failed health checks: $lastError"
