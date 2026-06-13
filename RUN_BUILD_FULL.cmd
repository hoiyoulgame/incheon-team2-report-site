@echo off
setlocal
cd /d "%~dp0"

set "PWSH=C:\Program Files\PowerShell\7\pwsh.exe"
set "LG_CATALOG_MAX_SCAN=260"
set "LG_CATALOG_MAX_DETAIL=350"
set "LG_CATALOG_DELAY_MS=80"

if exist "%PWSH%" (
  "%PWSH%" -ExecutionPolicy Bypass -File "%~dp0scripts\build_all.ps1" -RefreshCatalog
) else (
  powershell -ExecutionPolicy Bypass -File "%~dp0scripts\build_all.ps1" -RefreshCatalog
)

echo.
pause
