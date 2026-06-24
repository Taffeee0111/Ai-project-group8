#!/bin/bash
# Creates an isolated environment and optionally trains the offline recommender.
set -e

# Resolve every relative path from the project directory, even when double-clicked.
cd "$(dirname "$0")"

echo "Setting up Library Borrowing System..."
echo

if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
  echo "Python was not found. Please install Python 3 and try again."
  read -r -p "Press Enter to close this window..."
  exit 1
fi

if [ ! -d ".venv" ]; then
  # Prefer python3 on Unix-like systems while keeping a python fallback.
  echo "Creating local virtual environment at .venv..."
  if command -v python3 >/dev/null 2>&1; then
    python3 -m venv .venv
  else
    python -m venv .venv
  fi
else
  echo "Using existing local virtual environment at .venv."
fi

echo
echo "Installing Python dependencies..."
echo "This may take a few minutes, especially the first time."
.venv/bin/python -m pip install -r requirements.txt

echo
echo "The recommender model improves personalized recommendations."
echo "You can skip this and still use the app; recommendations will use popular high-rated books."
echo "If you want the full ML recommendations later, rerun setup later and choose yes."
read -r -p "Train recommender model now? This may take a while. [y/N] " TRAIN_MODEL
# Model training is optional because the application has a popularity fallback.
case "$TRAIN_MODEL" in
  [yY]|[yY][eE][sS])
    echo "Training recommender model..."
    .venv/bin/python backend/ml/train_recommender.py
    ;;
  *)
    echo "Skipping model training. The app will still run with popular high-rated fallback recommendations."
    ;;
esac

echo
echo "Setup complete."
echo "Run ./start_server.command, then open http://127.0.0.1:8000/"
read -r -p "Press Enter to close this window..."
