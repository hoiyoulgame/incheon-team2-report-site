@echo off
setlocal
cd /d "%~dp0"

set /p REMOTE_URL=Paste GitHub repository HTTPS URL: 
if "%REMOTE_URL%"=="" (
  echo [ERROR] Remote URL is empty.
  pause
  exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REMOTE_URL%"
) else (
  git remote set-url origin "%REMOTE_URL%"
)

git push -u origin main

echo.
echo If the push succeeded, open GitHub Settings > Pages and set Source to GitHub Actions.
echo.
pause
