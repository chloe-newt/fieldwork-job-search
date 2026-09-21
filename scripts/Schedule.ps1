param([switch]$Remove, [switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$taskName = 'Fieldwork Job Search - ' + $env:USERNAME
try {
    if ($Remove) {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
        Write-Host 'Automatic Windows searches disabled. Your data and in-app scheduler are unchanged.'
        exit 0
    }
    if (-not (Test-Path -LiteralPath (Join-Path $appRoot '.runtime\node.exe'))) { & (Join-Path $PSScriptRoot 'Setup.ps1') }
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $runner = Join-Path $PSScriptRoot 'ScheduledRun.ps1'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '"') -WorkingDirectory $appRoot
    $hourly = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours 1)
    $logon = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    if ($ValidateOnly) {
        $definition = New-ScheduledTask -Action $action -Trigger @($hourly,$logon) -Principal $principal -Settings $settings
        $definition | Export-ScheduledTask
        exit 0
    }
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($hourly,$logon) -Principal $principal -Settings $settings -Description 'Checks due job sources while signed in. Catch-up after missed runs. Local SQLite only; no ChatGPT dependency.' -Force | Out-Null
    Write-Host "Enabled: $taskName"
    Write-Host 'Windows checks hourly and at sign-in. Each source retains its own 24-72 hour interval.'
    Write-Host 'Missed runs catch up when practical. Nothing runs while the computer is off.'
    Write-Host 'This configuration runs only while you are signed in; it also works with the screen locked.'
} catch { Write-Error "Could not configure Windows Task Scheduler: $($_.Exception.Message). See README for manual setup."; exit 1 }
