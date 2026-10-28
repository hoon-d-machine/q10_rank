@echo off
cd /d "%~dp0"
echo [setup] Qoo10 RPA - installing packages...

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3 and check "Add python.exe to PATH".
    pause
    exit /b 1
)

python -m pip install --upgrade pip
python -m pip install playwright requests python-dateutil python-dotenv gspread google-auth openpyxl
if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)

python -m playwright install chromium
if errorlevel 1 (
    echo [ERROR] playwright browser install failed.
    pause
    exit /b 1
)

echo.
echo [setup] Done. Run: python Qoo10_RPA.py
pause
