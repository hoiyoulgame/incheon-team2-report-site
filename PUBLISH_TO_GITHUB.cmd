@echo off
setlocal
cd /d "%~dp0"

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERROR] This folder is not a Git repository.
  echo Run the initial Git setup first.
  pause
  exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [ERROR] GitHub remote is not connected yet.
  echo Example:
  echo   git remote add origin https://github.com/YOUR_ID/incheon-team2-report-site.git
  pause
  exit /b 1
)

git add .github .gitignore RUN_BUILD.cmd RUN_BUILD_FULL.cmd PUBLISH_TO_GITHUB.cmd config public scripts

for /f "tokens=1-4 delims=/-. " %%a in ("%date%") do set TODAY=%%a-%%b-%%c
for /f "tokens=1-2 delims=:." %%a in ("%time%") do set NOW=%%a%%b

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Update report site %TODAY% %NOW%"
) else (
  echo No file changes to commit.
)

git status -sb
git push origin main

echo.
pause
