$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = Join-Path $appRoot '.runtime\node.exe'
$logDir = Join-Path $appRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir ('scheduled-' + (Get-Date -Format 'yyyy-MM-dd') + '.log')
try {
    if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Standalone runtime missing. Run Setup.cmd.' }
    "Started $(Get-Date -Format o)" | Add-Content -LiteralPath $log
    & $nodeExe (Join-Path $appRoot 'server.mjs') --search-once 2>&1 | Out-File -LiteralPath $log -Append -Encoding utf8
    exit $LASTEXITCODE
} catch { $_ | Out-File -LiteralPath $log -Append -Encoding utf8; exit 1 }
