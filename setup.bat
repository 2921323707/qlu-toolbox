@echo off
setlocal
cd /d "%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
    echo [ERROR] uv is required. Install it from https://docs.astral.sh/uv/
    pause
    exit /b 1
)

echo Syncing locked runtime dependencies with uv...
uv sync --locked --no-dev
if errorlevel 1 goto :failed

echo Installing fallback Chromium browser...
uv run --locked --no-dev playwright install chromium
if errorlevel 1 goto :failed

echo.
echo Setup completed. Double-click run.bat to start QLU Toolbox.
pause
exit /b 0

:failed
echo.
echo Setup failed. Check uv, the lockfile, and the network connection.
pause
exit /b 1
