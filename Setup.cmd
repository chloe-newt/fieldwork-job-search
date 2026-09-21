@echo off
title Fieldwork Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Setup.ps1" -InstallShortcuts
if errorlevel 1 (
  echo.
  echo Setup failed. Please read the error above and the README recovery instructions.
  pause
  exit /b 1
)
echo.
echo Setup complete. Opening Fieldwork...
wscript.exe "%~dp0Start Fieldwork.vbs"
