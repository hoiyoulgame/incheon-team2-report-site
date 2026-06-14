@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0publish.log" del /q "%~dp0publish.log" >nul 2>&1

echo.
echo ============================================================
echo  Publish Incheon Team 2 Report Site
echo ============================================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERROR] This folder is not a Git repository.
  exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [ERROR] GitHub remote is not connected yet.
  echo Example:
  echo   git remote add origin https://github.com/YOUR_ID/incheon-team2-report-site.git
  exit /b 1
)

git config core.autocrlf false >nul 2>&1
git config core.safecrlf false >nul 2>&1

git add .github .gitignore RUN_BUILD.cmd RUN_BUILD_FULL.cmd PUBLISH_TO_GITHUB.cmd config public scripts
if errorlevel 1 (
  echo [ERROR] git add failed.
  exit /b 1
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set STAMP=%%i

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Update report site %STAMP%"
  if errorlevel 1 (
    echo [ERROR] git commit failed.
    exit /b 1
  )
) else (
  echo No file changes to commit.
)

git push origin main
if errorlevel 1 (
  echo [ERROR] git push failed.
  exit /b 1
)

echo.
echo Publish complete.
exit /b 0
