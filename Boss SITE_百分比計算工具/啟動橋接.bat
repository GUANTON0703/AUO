@echo off
chcp 65001 >nul
echo ============================================================
echo  C1 Bridge - 安裝套件並啟動
echo ============================================================
echo.
echo [1/2] 安裝必要套件...
pip install requests beautifulsoup4 lxml html5lib pandas -q
if %errorlevel% neq 0 (
    echo.
    echo [錯誤] pip 安裝失敗，請確認 Python 已加入 PATH
    pause
    exit /b 1
)
echo     套件安裝完成
echo.
echo [2/2] 啟動橋接程式...
echo.
python C1_bridge.py
pause
