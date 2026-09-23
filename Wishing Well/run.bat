@echo off
SET PYTHON=\\tw100049089\00_MyAgent\Python\Python312\Scripts\python.exe
SET APP_PATH=\\tw100049089\00_MyAgent\Wishing Well\app.py
SET INDEX_HTML=\\tw100049089\00_MyAgent\Wishing Well\index.html

echo Starting app.py with shared Python...
start "Wishing Well App" /B "%PYTHON%" "%APP_PATH%"

echo Waiting for server to start...
:CHECK_SERVER
timeout /t 1 /nobreak >nul
netstat -ano | findstr :5101 >nul
if errorlevel 1 goto CHECK_SERVER

echo Server is ready!
timeout /t 2 /nobreak >nul
start "" "http://localhost:5101"