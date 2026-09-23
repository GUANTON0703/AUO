@echo off
setlocal

set "USE_PY="

py -3.12 --version >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%i in ('py -3.12 -c "import sys;print(sys.executable)" 2^>nul') do set "USE_PY=%%i"
)

if not defined USE_PY (
    echo [ERROR] Python 3.12 not found. Please install Python 3.12 or check py launcher.
    pause
    exit /b 1
)

set "USE_PYW=%USE_PY:python.exe=pythonw.exe%"

if exist "%USE_PYW%" (
    start "" "%USE_PYW%" "%~dp0tray.py"
) else (
    start "" "%USE_PY%" "%~dp0tray.py"
)

endlocal