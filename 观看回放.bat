@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  start "" "%~dp0replay.html"
  exit /b
)
if "%~1"=="" (
  node cli\watch.cjs
) else (
  node cli\watch.cjs --session "%~1"
)
if errorlevel 1 pause
