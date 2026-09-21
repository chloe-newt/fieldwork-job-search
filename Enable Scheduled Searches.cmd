@echo off
title Fieldwork Scheduled Searches
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Schedule.ps1"
pause
