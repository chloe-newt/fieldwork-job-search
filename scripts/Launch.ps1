param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = Join-Path $appRoot '.runtime\node.exe'
$port = if ($env:FIELDWORK_PORT) { [int]$env:FIELDWORK_PORT } else { 4317 }
$url = "http://localhost:$port"
$healthUrl = "http://127.0.0.1:$port/api/health"
# Bypass system web proxies only in this launcher process for loopback probes.
[Net.WebRequest]::DefaultWebProxy = New-Object Net.WebProxy
$logDir = Join-Path $appRoot 'logs'
try {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    if (-not (Test-Path -LiteralPath $nodeExe)) {
        & (Join-Path $PSScriptRoot 'Setup.ps1')
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $nodeExe)) { throw 'Setup could not install a standalone runtime. Run Setup.cmd to see the details.' }
    }
    $ready = $false
    try { $health = Invoke-RestMethod $healthUrl -TimeoutSec 2; $ready = $health.app -eq 'fieldwork' } catch {}
    if (-not $ready) {
        # WScript starts Node directly, then exits. No terminal or PowerShell pipe
        # needs to remain alive for the web server to continue running.
        $worker = Join-Path $PSScriptRoot 'BackgroundServer.vbs'
        $stderr = Join-Path $logDir 'server.log'
        Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + $worker + '"') -WorkingDirectory $appRoot -WindowStyle Hidden
        for ($attempt = 0; $attempt -lt 45; $attempt++) {
            Start-Sleep -Milliseconds 600
            try { $health = Invoke-RestMethod $healthUrl -TimeoutSec 1; $ready = $health.app -eq 'fieldwork'; if ($ready) { break } } catch {}
        }
        if (-not $ready) {
            $details = if (Test-Path -LiteralPath $stderr) { (Get-Content -LiteralPath $stderr -Tail 12) -join "`n" } else { '' }
            throw "Fieldwork did not start. Check that port $port is available.`n`n$details`n`nLogs: $logDir"
        }
    }
    if ($OpenBrowser) { Start-Process $url }
} catch {
    $message = $_.Exception.Message
    $message | Add-Content -LiteralPath (Join-Path $logDir 'launcher-errors.log')
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($message, 'Fieldwork could not start', 'OK', 'Error') | Out-Null
    exit 1
}
