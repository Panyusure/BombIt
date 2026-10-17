@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 18 or newer.
  pause
  exit /b 1
)
node cli\bombit.cjs play
pause
