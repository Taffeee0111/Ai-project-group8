#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Starting Library Borrowing System..."
echo
echo "After the server starts, open this URL in your browser:"
echo "http://127.0.0.1:8000/"
echo
echo "Do not close this window. Closing it will stop the website."
echo

if [ -x ".venv/bin/python" ]; then
  .venv/bin/python backend/server.py
else
  echo "Local virtual environment was not found."
  echo "Run ./setup.command first, then start the server again."
  read -r -p "Press Enter to close this window..."
  exit 1
fi
