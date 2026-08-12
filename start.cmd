@echo off
cd /d "%~dp0"
call npm start
echo.
echo Server stopped. Press any key to close this window.
pause >nul
