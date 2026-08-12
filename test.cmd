@echo off
cd /d "%~dp0"
call npm test
echo.
echo Press any key to close this window.
pause >nul
