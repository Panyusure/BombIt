@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================
echo   Q版泡泡堂 - 自动测试
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [!] 没找到 Node.js，跳过逻辑测试（只跑浏览器测试）
  goto browser
)

echo [1/2] 逻辑测试（无头 Node）...
echo.
node tests\headless.js
set LOGIC=%errorlevel%
echo.

:browser
echo [2/2] 浏览器测试（无头 Edge）...
echo.

set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe

if not exist "%EDGE%" (
  echo [!] 没找到 Edge 或 Chrome，跳过浏览器测试
  goto done
)

"%EDGE%" --headless=new --disable-gpu --no-first-run --no-default-browser-check ^
  --autoplay-policy=no-user-gesture-required ^
  --user-data-dir="%TEMP%\bombit-test-profile" --virtual-time-budget=8000 ^
  --dump-dom "file:///%~dp0tests/browser.html" 2>nul > "%TEMP%\bombit-dom.txt"

powershell -NoProfile -Command ^
  "$d = Get-Content -Raw '%TEMP%\bombit-dom.txt'; $m = [regex]::Match($d, '(?s)BI_TEST_BEGIN(.*?)BI_TEST_END'); if ($m.Success) { $m.Groups[1].Value -replace '&lt;','<' -replace '&gt;','>' -replace '&amp;','&' } else { '[!] 没抓到测试输出' }"

:done
echo.
echo ============================================
echo   测试结束
echo ============================================
pause
