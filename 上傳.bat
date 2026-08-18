@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo 正在檢查目前資料夾...
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
    echo [錯誤] 這個資料夾不是 Git 倉庫。
    pause
    exit /b 1
)

echo 正在檢查遠端設定...
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    echo [錯誤] 找不到 origin 遠端，請先設定 GitHub repo。
    pause
    exit /b 1
)

echo 正在檢查變更...
git add -A
for /f "delims=" %%i in ('git status --short') do set HAS_CHANGES=1
if not defined HAS_CHANGES (
    echo 沒有可提交的變更。
    pause
    exit /b 0
)

git status --short
set /p COMMIT_MSG=請輸入這次上傳的說明（直接按 Enter 用預設訊息）：
if "%COMMIT_MSG%"=="" set COMMIT_MSG=update

echo 正在提交...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo [錯誤] commit 失敗。
    pause
    exit /b 1
)

echo 正在推送到 GitHub...
git push origin main
if errorlevel 1 (
    echo [錯誤] push 失敗。
    pause
    exit /b 1
)

echo.
echo 完成。
pause
