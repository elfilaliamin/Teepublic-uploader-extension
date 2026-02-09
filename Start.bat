@echo off
title Redbubble Flask Server
cd /d "%~dp0"

REM If you use a virtual environment, uncomment ONE of these:
REM call venv\Scripts\activate
REM call .venv\Scripts\activate

echo Starting Flask server...
python server.py

echo.
echo Server stopped. Press any key to close.
pause >nul
