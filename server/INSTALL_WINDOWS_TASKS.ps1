param(
  [string]$BackupDestination = "D:\FinanceServer\backups",
  [string]$ServerTaskName = "FinanceCentralServer",
  [string]$BackupTaskName = "FinanceCentralBackup"
)

$ErrorActionPreference = "Stop"
$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $serverRoot ".env"
$serverScript = Join-Path $serverRoot "central-server.cjs"
$backupScript = Join-Path $serverRoot "backup.ps1"

if (-not (Test-Path -LiteralPath $envFile)) { throw "Copy .env.example to .env and configure it first." }
$node = (Get-Command node -ErrorAction Stop).Source
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source

$serverAction = New-ScheduledTaskAction -Execute $node -Argument ('"{0}"' -f $serverScript) -WorkingDirectory $serverRoot
$serverTrigger = New-ScheduledTaskTrigger -AtStartup
$serverSettings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable
Register-ScheduledTask -TaskName $ServerTaskName -Action $serverAction -Trigger $serverTrigger -Settings $serverSettings -User "SYSTEM" -RunLevel Highest -Force | Out-Null

$backupArgs = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Destination "{1}"' -f $backupScript,$BackupDestination
$backupAction = New-ScheduledTaskAction -Execute $powerShell -Argument $backupArgs -WorkingDirectory $serverRoot
$backupTrigger = New-ScheduledTaskTrigger -Daily -At "02:00"
$backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName $BackupTaskName -Action $backupAction -Trigger $backupTrigger -Settings $backupSettings -User "SYSTEM" -RunLevel Highest -Force | Out-Null

Start-ScheduledTask -TaskName $ServerTaskName
Write-Output "Installed and started: $ServerTaskName"
Write-Output "Daily backup task installed: $BackupTaskName -> $BackupDestination"
