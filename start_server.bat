@echo off
cd /d "%~dp0"

echo Starting Library Borrowing System...
echo.
echo After the server starts, open this URL in your browser:
echo http://127.0.0.1:8000/
echo.
echo Do not close this window. Closing it will stop the website.
echo.

if exist "C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
  "C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" backend\server.py
) else (
  python backend\server.py
)

pause
