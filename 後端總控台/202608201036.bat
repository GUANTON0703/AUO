@echo off
setlocal

set "TARGET=\\tw100049089\00_MyAgent\Python\SharedLib"
set "LOCAL_PY="

py -3.12 --version >nul 2>&1
if not errorlevel 1 ( set "LOCAL_PY=py -3.12" & goto :found )
python --version >nul 2>&1
if not errorlevel 1 ( set "LOCAL_PY=python" & goto :found )
echo [FAIL] No local Python found.
pause & exit /b 1

:found
echo [OK] Python: %LOCAL_PY%
echo Installing pystray and Pillow to SharedLib...
echo.

%LOCAL_PY% -m pip install pystray Pillow --target "%TARGET%" --disable-pip-version-check --no-warn-script-location

echo.
echo Done.
pause
endlocal
