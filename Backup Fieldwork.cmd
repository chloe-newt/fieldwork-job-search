@echo off
title Fieldwork Backup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Backup.ps1"
pause
