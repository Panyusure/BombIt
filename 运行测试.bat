@echo off
cd /d "%~dp0"
title BombIt tests
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  pause
  exit /b 1
)
node tests\run.cjs
if errorlevel 1 goto done
node tests\run-browser.cjs
if errorlevel 1 goto done
node tests\run-browser.cjs --replay
:done
pause
