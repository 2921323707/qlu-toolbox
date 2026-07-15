@echo off
setlocal
cd /d "%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
    echo [ERROR] uv is required. Install it from https://docs.astral.sh/uv/
    pause
    exit /b 1
)

echo Syncing locked build dependencies with uv...
uv sync --locked
if errorlevel 1 goto :failed

echo Building QLU Toolbox Alpha...
uv run --locked pyinstaller --noconfirm QLUToolbox.spec
if errorlevel 1 goto :failed

echo.
echo Build completed: dist\QLUToolbox\QLUToolbox.exe
pause
exit /b 0

:failed
echo.
echo Build failed. Review uv and PyInstaller output above.
pause
exit /b 1
