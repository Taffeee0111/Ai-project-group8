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

if command -v python3 >/dev/null 2>&1; then
  python3 backend/server.py
elif command -v python >/dev/null 2>&1; then
  python backend/server.py
else
  echo "Python was not found. Please install Python 3 and try again."
  read -r -p "Press Enter to close this window..."
  exit 1
fi
