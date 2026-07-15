@echo off
setlocal
cd /d "%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
    echo [ERROR] uv is required. Install it from https://docs.astral.sh/uv/
    pause
    exit /b 1
)

uv sync --locked --no-dev --quiet
if errorlevel 1 (
    echo [ERROR] Failed to sync the locked runtime environment.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\pythonw.exe" (
    echo [ERROR] Python environment is unavailable. Run setup.bat first.
    pause
    exit /b 1
)

start "" ".venv\Scripts\pythonw.exe" main.py
