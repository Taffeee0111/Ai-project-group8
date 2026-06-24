@echo off
rem Creates an isolated environment and optionally trains the offline recommender.
cd /d "%~dp0"

echo Setting up Library Borrowing System...
echo.

where python >nul 2>nul
rem Prefer python when available; py -3 supports common Windows installations.
if errorlevel 1 (
  py -3 --version >nul 2>nul
  if errorlevel 1 (
    echo Python was not found. Please install Python 3 and try again.
    pause
    exit /b 1
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating local virtual environment at .venv...
  where python >nul 2>nul
  if errorlevel 1 (
    py -3 -m venv .venv
  ) else (
    python -m venv .venv
  )
  if errorlevel 1 (
    echo Failed to create the virtual environment.
    pause
    exit /b 1
  )
) else (
  echo Using existing local virtual environment at .venv.
)

echo.
echo Installing Python dependencies...
echo This may take a few minutes, especially the first time.
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
  echo Failed to install Python dependencies.
  pause
  exit /b 1
)

echo.
echo The recommender model improves personalized recommendations.
echo You can skip this and still use the app; recommendations will use popular high-rated books.
echo If you want the full ML recommendations later, rerun setup later and choose yes.
choice /c YN /n /m "Train recommender model now? This may take a while. [y/N] "
rem Training is optional because the application has a popularity fallback.
if errorlevel 2 goto skip_model
if errorlevel 1 (
  echo Training recommender model...
  .venv\Scripts\python.exe backend\ml\train_recommender.py
  if errorlevel 1 (
    echo Recommender model training failed.
    pause
    exit /b 1
  )
)
goto done_model

:skip_model
echo Skipping model training. The app will still run with popular high-rated fallback recommendations.

:done_model
echo.
echo Setup complete.
echo Run start_server.bat, then open http://127.0.0.1:8000/
pause
