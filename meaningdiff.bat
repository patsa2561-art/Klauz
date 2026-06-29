@echo off
REM Double-click to launch meaningdiff. No terminal/git knowledge needed.
cd /d "%~dp0"

REM Prefer a bundled portable Node (zero-install zip) if present, else system Node.
set "NODE_EXE=node"
if exist "%~dp0node\node.exe" set "NODE_EXE=%~dp0node\node.exe"

REM If no Node at all, tell the user plainly instead of flashing a black window.
"%NODE_EXE%" -v >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js was not found.
  echo   Easiest fix: install it once from  https://nodejs.org  (pick "LTS"),
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo   meaningdiff is starting...
echo   Your browser will open automatically at:  http://127.0.0.1:7700
echo   (Keep this window open while you use it. Close it to stop.)
echo.
start "" /min cmd /c "timeout /t 3 >nul & start http://127.0.0.1:7700"
"%NODE_EXE%" bin/meaningdiff.js serve
pause
