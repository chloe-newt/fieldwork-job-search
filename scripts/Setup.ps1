param([switch]$InstallShortcuts)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $appRoot '.runtime'
$nodeExe = Join-Path $runtimeDir 'node.exe'
try {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    if (-not (Test-Path -LiteralPath $nodeExe)) {
        $installed = Get-Command node.exe -ErrorAction SilentlyContinue
        $canCopy = $false
        if ($installed -and $installed.Source -notmatch '\\.codex\\|ChatGPT|Codex') {
            $major = & $installed.Source -p "process.versions.node.split('.')[0]"
            $canCopy = $LASTEXITCODE -eq 0 -and $major -eq '24'
        }
        if ($canCopy) {
            Write-Host 'Copying the standalone Node.js runtime into the application folder...'
            Copy-Item -LiteralPath $installed.Source -Destination $nodeExe
        } else {
            Write-Host 'Downloading the official Node.js 24 LTS runtime (one-time internet access)...'
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $releases = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
            $release = $releases | Where-Object { $_.version -match '^v24\.' -and $_.lts } | Select-Object -First 1
            if (-not $release) { throw 'No Node.js 24 LTS release found on nodejs.org.' }
            $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
            $archiveName = "node-$($release.version)-win-$architecture.zip"
            $baseUrl = "https://nodejs.org/dist/$($release.version)"
            $archivePath = Join-Path $runtimeDir $archiveName
            Invoke-WebRequest "$baseUrl/$archiveName" -OutFile $archivePath -UseBasicParsing
            $hashList = (Invoke-WebRequest "$baseUrl/SHASUMS256.txt" -UseBasicParsing).Content
            $escapedName = [regex]::Escape($archiveName)
            $expected = [regex]::Match($hashList, "(?m)^([a-f0-9]{64})\s+$escapedName\s*$").Groups[1].Value
            if (-not $expected -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expected) { throw 'Runtime checksum verification failed. Download was not installed.' }
            Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeDir -Force
            $extracted = Join-Path $runtimeDir "node-$($release.version)-win-$architecture"
            Copy-Item -LiteralPath (Join-Path $extracted 'node.exe') -Destination $nodeExe
            Copy-Item -LiteralPath (Join-Path $extracted 'LICENSE') -Destination (Join-Path $runtimeDir 'NODE-LICENSE.txt')
        }
    }
    & $nodeExe -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');db.exec('SELECT 1');db.close();console.log('Runtime and SQLite verified: '+process.version)"
    if ($LASTEXITCODE -ne 0) { throw 'The standalone runtime did not pass verification.' }
    foreach ($name in @('data','backups','logs')) { New-Item -ItemType Directory -Path (Join-Path $appRoot $name) -Force | Out-Null }
    if ($InstallShortcuts) {
        $shell = New-Object -ComObject WScript.Shell
        $desktop = [Environment]::GetFolderPath('Desktop')
        $programs = [Environment]::GetFolderPath('Programs')
        foreach ($shortcutPath in @((Join-Path $desktop 'Fieldwork Job Search.lnk'), (Join-Path $programs 'Fieldwork Job Search.lnk'))) {
            $shortcut = $shell.CreateShortcut($shortcutPath)
            $shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
            $shortcut.Arguments = '"' + (Join-Path $appRoot 'Start Fieldwork.vbs') + '"'
            $shortcut.WorkingDirectory = $appRoot
            $shortcut.Description = 'Fieldwork - standalone local job search'
            $shortcut.IconLocation = "$env:WINDIR\System32\shell32.dll,22"
            $shortcut.Save()
        }
        Write-Host 'Desktop and Start menu shortcuts created.'
    }
    Write-Host 'Fieldwork is ready. No npm packages, Python, Docker, ChatGPT or Codex are needed.'
} catch { Write-Error $_; exit 1 }
