@echo off
rem Starts the application with the environment created by setup.bat.
cd /d "%~dp0"

echo Starting Library Borrowing System...
echo.
echo After the server starts, open this URL in your browser:
echo http://127.0.0.1:8000/
echo.
echo Do not close this window. Closing it will stop the website.
echo.

if exist ".venv\Scripts\python.exe" (
  .venv\Scripts\python.exe backend\server.py
) else (
  echo Local virtual environment was not found.
  echo Run setup.bat first, then start the server again.
)

pause
