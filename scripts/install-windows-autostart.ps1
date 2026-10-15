$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskName = 'AgriConnect Local Server'
$watchdogTaskName = 'AgriConnect Local Server Watchdog'
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$startupScript = Join-Path $PSScriptRoot 'start-local.ps1'
$watchdogScript = Join-Path $PSScriptRoot 'watchdog-local.ps1'

$action = New-ScheduledTaskAction `
  -Execute $powershellPath `
  -Argument "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$startupScript`"" `
  -WorkingDirectory $projectRoot
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $logonTrigger `
  -Principal $principal `
  -Settings $settings `
  -Description 'Starts the local AgriConnect server at sign-in and restarts it if it exits unexpectedly.' `
  -Force | Out-Null

$watchdogCommand = "`"$powershellPath`" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$watchdogScript`""
& schtasks.exe /Create /SC MINUTE /MO 1 /TN $watchdogTaskName /TR $watchdogCommand /RU $account /IT /F
if ($LASTEXITCODE -ne 0) {
  throw "Could not register the AgriConnect watchdog task (schtasks exit code $LASTEXITCODE)."
}

$watchdogSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable
Set-ScheduledTask -TaskName $watchdogTaskName -Settings $watchdogSettings | Out-Null

Start-ScheduledTask -TaskName $taskName

$deadline = (Get-Date).AddSeconds(60)
do {
  try {
    $response = Invoke-WebRequest -Uri 'http://localhost:3000/healthz' -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      Write-Output "AgriConnect autostart is installed and healthy at http://localhost:3000."
      Write-Output "Startup log: $(Join-Path $projectRoot 'data\logs\local-server.log')"
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 2
  }
} while ((Get-Date) -lt $deadline)

$logPath = Join-Path $projectRoot 'data\logs\local-server.log'
if (Test-Path $logPath) {
  Get-Content $logPath -Tail 30
}
throw "AgriConnect did not become healthy. Check the startup log at $logPath"
