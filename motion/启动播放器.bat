@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Opening index.html directly...
  start "" "%~dp0index.html"
  exit /b
)
start "BOMBIT motion server" /min cmd /c node "%~dp0tools\serve.mjs" "%~dp0.." 8188
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8188/motion/"
endlocal
