@echo off
cd /d "%~dp0"
python Qoo10_RPA.py
if errorlevel 1 (
    echo.
    echo [ERROR] Finished with errors. Check logs folder.
)
pause
