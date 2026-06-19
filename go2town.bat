@echo off
REM ==========================================================================
REM  go2town - one-click launcher (Windows)
REM  Double-click this file to install deps (first run), start the server,
REM  and open the game in your browser. Keep the window open while playing;
REM  press Ctrl+C or close it to stop.
REM ==========================================================================
title go2town - Coma-ruga
cd /d "%~dp0"

REM --- Find Python -----------------------------------------------------------
set "PY=python"
where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo.
    echo  [X] Python 3 was not found on your PATH.
    echo      Install it from https://www.python.org/downloads/ ^(tick "Add to PATH"^)
    echo      and run this file again.
    echo.
    pause
    exit /b 1
  )
  set "PY=py"
)

REM --- Install the one dependency on first run -------------------------------
%PY% -c "import edge_tts" 1>nul 2>nul
if errorlevel 1 (
  echo  Installing dependencies ^(first run only^)...
  %PY% -m pip install -r requirements.txt
  if errorlevel 1 (
    echo  [X] Dependency install failed. Check your internet connection.
    pause
    exit /b 1
  )
)

REM --- Stop any previously running go2town server ---------------------------
REM  Free port 8000 so a fresh server can start (and we never run two at once).
echo  Stopping any previous go2town server on port 8000...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do (
  taskkill /F /PID %%P >nul 2>nul
)

REM --- Launch ---------------------------------------------------------------
echo.
echo   go2town is starting...  Coco is warming up her voice.
echo   Game:  http://localhost:8000
echo   Keep this window open while you play. Press Ctrl+C to stop.
echo.

start "" http://localhost:8000/
%PY% server.py

pause
