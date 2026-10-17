@echo off
cd /d "%~dp0"
title BombIt tests

rem ============================================================
rem  Pure ASCII on purpose: a .bat with UTF-8 Chinese is decoded with
rem  the console code page (936 on Chinese Windows), which shifts lines
rem  and can swallow quotes / carets / parentheses. See the launcher .bat
rem  in this folder for the full explanation.
rem  Long browser commands are kept on a single line for the same reason.
rem ============================================================

echo.
echo ============================================
echo   BombIt - automated tests
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js not found - skipping the headless logic tests.
  goto browser
)

echo [1/2] headless logic tests (Node)...
echo.
node tests\headless.js
echo.

:browser
echo [2/2] browser tests (headless Edge / Chrome)...
echo.

set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe

if not exist "%EDGE%" (
  echo [!] Neither Edge nor Chrome found - skipping browser tests.
  goto done
)

"%EDGE%" --headless=new --disable-gpu --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --user-data-dir="%TEMP%\bombit-test-profile" --virtual-time-budget=8000 --dump-dom "file:///%~dp0tests/browser.html" 2>nul > "%TEMP%\bombit-dom.txt"

powershell -NoProfile -Command "$d = Get-Content -Raw '%TEMP%\bombit-dom.txt'; $m = [regex]::Match($d, '(?s)BI_TEST_BEGIN(.*?)BI_TEST_END'); if ($m.Success) { $m.Groups[1].Value -replace '&lt;','<' -replace '&gt;','>' -replace '&amp;','&' } else { '[!] no test output captured' }"

:done
echo.
echo ============================================
echo   done
echo ============================================
pause
