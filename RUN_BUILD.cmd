@echo off
setlocal
cd /d "%~dp0"

set "PWSH=C:\Program Files\PowerShell\7\pwsh.exe"

if exist "%PWSH%" (
  "%PWSH%" -ExecutionPolicy Bypass -File "%~dp0scripts\build_all.ps1"
) else (
  powershell -ExecutionPolicy Bypass -File "%~dp0scripts\build_all.ps1"
)

echo.
pause
