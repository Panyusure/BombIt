@echo off
cd /d "%~dp0"
title BombIt

rem ============================================================
rem  Why this launcher exists:
rem    Browsers refuse to play audio before the user interacts with the
rem    page, so opening index.html directly needs one click before the
rem    music starts. Launching with
rem    --autoplay-policy=no-user-gesture-required removes that step, for
rem    this load and for every F5 reload after it.
rem
rem  Why a dedicated user-data-dir:
rem    A browser only reads command line flags when it starts its main
rem    process. If Edge/Chrome is already running, the new command is
rem    handed to that process and the flags are dropped. A separate
rem    profile forces a fresh process, and keeps the game window apart
rem    from the everyday browser window.
rem
rem  NOTE: this file is intentionally pure ASCII.
rem    A .bat containing UTF-8 Chinese is decoded with the console code
rem    page (936 on Chinese Windows). That shifts lines and can swallow
rem    quotes / carets / parentheses, after which the script dies with
rem    "'xxx' is not recognized as an internal or external command".
rem    Keep every message here in ASCII; Chinese lives in the game and
rem    in the documents.
rem ============================================================

set EDGE_X86=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
set EDGE_X64=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
set CHROME_X64=%ProgramFiles%\Google\Chrome\Application\chrome.exe
set CHROME_X86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe

set BROWSER=
if exist "%EDGE_X86%" set BROWSER=%EDGE_X86%
if not defined BROWSER if exist "%EDGE_X64%" set BROWSER=%EDGE_X64%
if not defined BROWSER if exist "%CHROME_X64%" set BROWSER=%CHROME_X64%
if not defined BROWSER if exist "%CHROME_X86%" set BROWSER=%CHROME_X86%

if not defined BROWSER goto nobrowser

echo Starting BombIt with music enabled...
start "" "%BROWSER%" --autoplay-policy=no-user-gesture-required --user-data-dir="%LOCALAPPDATA%\BombIt\browser" --no-first-run --no-default-browser-check --new-window "%~dp0index.html"
exit /b 0

:nobrowser
echo.
echo [!] Edge or Chrome was not found.
echo     You can still play: double-click index.html
echo     (click once on the page if the music does not start).
echo.
pause
exit /b 1
