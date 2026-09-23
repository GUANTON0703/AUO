@echo off
setlocal enabledelayedexpansion

:: Auto CD to folder where this bat is located
cd /d "%~dp0"

:MENU
cls
echo.
echo  ==========================================
echo   Python Script Launcher
echo  ==========================================
echo.
echo  Folder: %cd%
echo.
echo  ------------------------------------------
echo   .py files found:
echo  ------------------------------------------
echo.

set count=0
for %%f in (*.py) do (
    set /a count+=1
    set "file_!count!=%%f"
    echo   [!count!] %%f
)

if %count%==0 (
    echo   No .py files found in this folder!
    echo.
    pause
    exit /b
)

echo.
echo  ------------------------------------------
echo   [0] Refresh    [Q] Quit
echo  ------------------------------------------
echo.
set /p choice=  Enter number: 

:: Quit
if /i "%choice%"=="Q" exit /b
if /i "%choice%"=="q" exit /b

:: Refresh
if "%choice%"=="0" goto MENU

:: Check if choice is a number
echo %choice%| findstr /r "^[0-9][0-9]*$" >nul 2>&1
if errorlevel 1 goto INVALID

:: Check range
if %choice% LSS 1 goto INVALID
if %choice% GTR %count% goto INVALID

:: Get filename (call set trick for dynamic variable name)
call set "selectedfile=%%file_%choice%%%"

cls
echo.
echo  ==========================================
echo   Running: %selectedfile%
echo  ==========================================
echo.

python "%selectedfile%"

echo.
echo  ------------------------------------------
echo   Finished.
echo   [R] Back to menu    [any key] Exit
echo  ------------------------------------------
echo.
set /p again=  Enter: 
if /i "%again%"=="R" goto MENU
if /i "%again%"=="r" goto MENU

exit /b

:INVALID
echo.
echo   Invalid input, please try again.
timeout /t 2 >nul
goto MENU

endlocal
