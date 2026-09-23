@echo off
setlocal EnableDelayedExpansion

echo ========================================
echo  Wishing Well - Launcher
echo ========================================
echo.

REM --- Check Python ---
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found in PATH.
    echo         Please install Python 3.8+ and try again.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo [INFO] %%v
echo.

REM --- Fixed paths ---
set "APPPATH=\\tw100049089\00_MyAgent\Wishing Well\app.py"
set "REQPATH=\\tw100049089\00_MyAgent\Wishing Well\requirements.txt"

REM --- Validate app.py ---
if not exist "!APPPATH!" (
    echo [ERROR] app.py not found:
    echo         !APPPATH!
    echo         Please check your network connection and try again.
    pause
    exit /b 1
)
echo [INFO] Found: !APPPATH!
echo.

REM --- Install dependencies ---
echo [INFO] Installing dependencies ...
python -m pip install -r "!REQPATH!" -q
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [INFO] Dependencies OK.
echo.

REM --- Start server in a separate minimized window ---
echo [INFO] Starting server in background ...
start "WishingWell-Server" /min python "!APPPATH!"

REM --- Wait for server to boot up (3 seconds) ---
echo [INFO] Waiting for server to start...
timeout /t 3 /nobreak >nul

REM --- Open browser pointing to the local server ---
echo [INFO] Opening Wishing Well in browser...
start "" "http://localhost:8000"


echo.
pause
endlocal
