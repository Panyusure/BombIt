@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Q版泡泡堂 - 启动

rem ============================================================
rem  为什么要有这个启动器：
rem    浏览器默认不许页面在用户交互之前出声（自动播放策略）。
rem    双击 index.html 进去，音乐要等你点一下或按个键才响；
rem    带上 --autoplay-policy=no-user-gesture-required 打开，
rem    加载完就出声，F5 刷新也一样 —— 这才是"刷新就有音乐"。
rem
rem  为什么要单独一个浏览器配置目录：
rem    浏览器只在启动主进程时读命令行参数。如果你的 Edge / Chrome
rem    已经开着，新命令会被交给现有进程，参数直接丢掉。
rem    指定 --user-data-dir 就能保证开出一个独立进程、参数生效，
rem    也顺便让游戏窗口不干扰你平时那个浏览器窗口。
rem ============================================================

set EDGE_X86=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
set EDGE_X64=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
set CHROME_X64=%ProgramFiles%\Google\Chrome\Application\chrome.exe
set CHROME_X86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe

set BROWSER=
for %%P in ("%EDGE_X86%" "%EDGE_X64%" "%CHROME_X64%" "%CHROME_X86%") do (
  if not defined BROWSER if exist %%P set BROWSER=%%~P
)

if not defined BROWSER (
  echo.
  echo [!] 没找到 Edge 或 Chrome。
  echo     请直接双击 index.html：游戏完全能玩，
  echo     只是音乐要等你点一下画面或按个键才会响。
  echo.
  pause
  exit /b 1
)

start "" "%BROWSER%" ^
  --autoplay-policy=no-user-gesture-required ^
  --user-data-dir="%LOCALAPPDATA%\BombIt\browser" ^
  --no-first-run --no-default-browser-check --new-window ^
  "%~dp0index.html"

exit /b 0
