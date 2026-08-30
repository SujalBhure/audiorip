#!/usr/bin/env bash
# AudioRip Local Engine Launcher
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================"
echo "    🚀 AudioRip Local High-Speed Engine"
echo "========================================"
echo "Starting local Python conversion server..."

# Check if server is already running
if pgrep -f "python3 app.py" > /dev/null; then
    echo "Server already running on port 5000!"
else
    python3 app.py > /dev/null 2>&1 &
    sleep 1.5
fi

echo "Engine is active on http://127.0.0.1:5000"

# Open browser if termux-open is available
if command -v termux-open-url > /dev/null 2>&1; then
    termux-open-url http://127.0.0.1:5000
elif command -v xdg-open > /dev/null 2>&1; then
    xdg-open http://127.0.0.1:5000
fi

echo "Ready to download 320kbps MP3s and playlists!"
