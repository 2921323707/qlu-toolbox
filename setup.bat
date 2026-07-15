@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    py -3 -m venv .venv 2>nul || python -m venv .venv
)

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Python 3 is required.
    pause
    exit /b 1
)

echo Installing Python packages...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :failed

echo Installing fallback Chromium browser...
".venv\Scripts\python.exe" -m playwright install chromium
if errorlevel 1 goto :failed

echo.
echo Setup completed. Double-click run.bat to start.
pause
exit /b 0

:failed
echo.
echo Setup failed. Check the network connection and try again.
pause
exit /b 1
