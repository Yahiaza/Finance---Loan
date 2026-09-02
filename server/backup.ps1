param(
  [string]$Destination = "D:\FinanceServer\backups"
)
$ErrorActionPreference = "Stop"
$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $serverRoot ".env"
if (-not (Test-Path -LiteralPath $envFile)) { throw "server\.env was not found." }
$settings = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
    $parts = $line.Split('=',2)
    $settings[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
  }
}
if (-not $settings.DATABASE_URL) { throw "DATABASE_URL is missing." }
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
$root = [System.IO.Path]::GetPathRoot($resolvedDestination)
if ($resolvedDestination.TrimEnd('\') -eq $root.TrimEnd('\')) { throw "Choose a dedicated backup folder, not a drive root." }
$target = Join-Path $resolvedDestination $stamp
New-Item -ItemType Directory -Path $target -Force | Out-Null
& pg_dump --dbname=$settings.DATABASE_URL --format=custom --file=(Join-Path $target "finance-postgresql.backup")
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
$attachments = $settings.FINANCE_FILES_DIR
if ($attachments -and (Test-Path -LiteralPath $attachments)) {
  Compress-Archive -LiteralPath $attachments -DestinationPath (Join-Path $target "attachments.zip") -CompressionLevel Optimal
}
Get-ChildItem -LiteralPath $resolvedDestination -Directory | Where-Object Name -Match '^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$' | Sort-Object CreationTime -Descending | Select-Object -Skip 30 | Remove-Item -Recurse -Force
Write-Output "Backup completed: $target"
