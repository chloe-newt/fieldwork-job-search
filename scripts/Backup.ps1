$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = Join-Path $appRoot '.runtime\node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) { & (Join-Path $PSScriptRoot 'Setup.ps1') }
& $nodeExe (Join-Path $appRoot 'server.mjs') --backup
if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Check that the database and backup folder are accessible.' }
