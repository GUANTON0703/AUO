@echo off
cd /d "%~dp0"
echo 正在從 GitHub 下載最新版本...
git pull origin main
echo.
echo 完成。
pause
