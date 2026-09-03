param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$connection = $null
$lockStream = $null

function Write-Result([hashtable]$Value) {
  $json = $Value | ConvertTo-Json -Compress -Depth 12
  [System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Add-Parameter($Command, [System.Data.Odbc.OdbcType]$Type, $Value) {
  $parameter = $Command.Parameters.Add('@value', $Type)
  if ($Type -eq [System.Data.Odbc.OdbcType]::NText) { $parameter.Size = [Math]::Max(1, ([string]$Value).Length) }
  $parameter.Value = $Value
}

function Read-State($Connection) {
  $command = $Connection.CreateCommand()
  $command.CommandText = 'SELECT Revision, StateJson, UpdatedAt FROM FinanceState WHERE Id=1'
  $reader = $command.ExecuteReader()
  try {
    if (-not $reader.Read()) { throw 'FinanceState row is missing.' }
    return @{
      revision = [int64]$reader.GetValue(0)
      stateJson = [string]$reader.GetValue(1)
      updatedAt = ([datetime]$reader.GetValue(2)).ToString('o')
    }
  } finally {
    $reader.Close()
    $reader.Dispose()
    $command.Dispose()
  }
}

try {
  $request = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $databasePath = [System.IO.Path]::GetFullPath([string]$request.databasePath)
  if ([System.IO.Path]::GetExtension($databasePath).ToLowerInvariant() -ne '.accdb') {
    throw 'Only .accdb Access databases are supported.'
  }
  $lockPath = "$databasePath.finance.lock"
  for ($attempt = 0; $attempt -lt 150; $attempt += 1) {
    try {
      $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
      break
    } catch [System.IO.IOException] {
      if ($attempt -eq 149) { throw 'The shared database is busy. Try again in a few seconds.' }
      Start-Sleep -Milliseconds 100
    }
  }

  if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) { throw 'The selected Access database does not exist.' }

  $connectionString = "Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=$databasePath;"
  $connection = New-Object System.Data.Odbc.OdbcConnection($connectionString)
  $connection.Open()

  try {
    $probe = $connection.CreateCommand()
    $probe.CommandText = 'SELECT COUNT(*) FROM FinanceState'
    [void]$probe.ExecuteScalar()
    $probe.Dispose()
  } catch {
    $tables = $connection.GetSchema('Tables')
    $userTables = @($tables.Rows | Where-Object { $_.TABLE_TYPE -eq 'TABLE' -and $_.TABLE_NAME -notlike 'MSys*' })
    if ($userTables.Count -gt 0) { throw 'The selected Access file contains other tables. Choose a new blank .accdb file.' }
    $create = $connection.CreateCommand()
    $create.CommandText = 'CREATE TABLE FinanceState (Id INTEGER CONSTRAINT PK_FinanceState PRIMARY KEY, Revision INTEGER NOT NULL, StateJson LONGTEXT, UpdatedAt DATETIME)'
    [void]$create.ExecuteNonQuery()
    $create.Dispose()
    $insert = $connection.CreateCommand()
    $insert.CommandText = 'INSERT INTO FinanceState (Id, Revision, StateJson, UpdatedAt) VALUES (?, ?, ?, ?)'
    Add-Parameter $insert ([System.Data.Odbc.OdbcType]::Int) 1
    Add-Parameter $insert ([System.Data.Odbc.OdbcType]::Int) 0
    Add-Parameter $insert ([System.Data.Odbc.OdbcType]::NText) '{}'
    Add-Parameter $insert ([System.Data.Odbc.OdbcType]::DateTime) ([datetime]::Now)
    [void]$insert.ExecuteNonQuery()
    $insert.Dispose()
  }

  if ($request.action -eq 'read' -or $request.action -eq 'initialize') {
    $state = Read-State $connection
    Write-Result @{ ok=$true; revision=$state.revision; stateJson=$state.stateJson; updatedAt=$state.updatedAt }
  } elseif ($request.action -eq 'write') {
    $baseRevision = [int64]$request.baseRevision
    $nextRevision = $baseRevision + 1
    $transaction = $connection.BeginTransaction()
    try {
      $update = $connection.CreateCommand()
      $update.Transaction = $transaction
      $update.CommandText = 'UPDATE FinanceState SET Revision=?, StateJson=?, UpdatedAt=? WHERE Id=1 AND Revision=?'
      Add-Parameter $update ([System.Data.Odbc.OdbcType]::Int) $nextRevision
      Add-Parameter $update ([System.Data.Odbc.OdbcType]::NText) ([string]$request.stateJson)
      Add-Parameter $update ([System.Data.Odbc.OdbcType]::DateTime) ([datetime]::Now)
      Add-Parameter $update ([System.Data.Odbc.OdbcType]::Int) $baseRevision
      $affected = $update.ExecuteNonQuery()
      $update.Dispose()
      if ($affected -ne 1) {
        $transaction.Rollback()
        $current = Read-State $connection
        Write-Result @{ ok=$false; conflict=$true; revision=$current.revision; stateJson=$current.stateJson; updatedAt=$current.updatedAt }
      } else {
        $transaction.Commit()
        Write-Result @{ ok=$true; revision=$nextRevision; updatedAt=([datetime]::Now).ToString('o') }
      }
    } catch {
      try { $transaction.Rollback() } catch {}
      throw
    } finally {
      $transaction.Dispose()
    }
  } elseif ($request.action -eq 'backup') {
    $backupPath = [System.IO.Path]::GetFullPath([string]$request.backupPath)
    $backupDirectory = [System.IO.Path]::GetDirectoryName($backupPath)
    [System.IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
    $connection.Close()
    $connection.Dispose()
    $connection = $null
    [System.IO.File]::Copy($databasePath, $backupPath, $false)
    Write-Result @{ ok=$true; path=$backupPath }
  } else {
    throw 'Unknown Access bridge action.'
  }
} catch {
  Write-Result @{ ok=$false; error=$_.Exception.Message }
} finally {
  if ($connection) { try { $connection.Close() } catch {}; $connection.Dispose() }
  if ($lockStream) { $lockStream.Dispose() }
  Remove-Item -LiteralPath $InputPath -Force -ErrorAction SilentlyContinue
}
