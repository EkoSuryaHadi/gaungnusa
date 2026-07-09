#!/bin/bash
# Gaung dev server keeper — auto-restarts if crashed
# Run in background: nohup ./dev-keeper.sh &

cd /home/ubuntu/gaung
echo "[dev-keeper] Starting Gaung Dev Server (auto-restart mode)"

while true; do
    echo "[dev-keeper] Launching on port 3000..."
    npm run dev 2>&1
    echo "[dev-keeper] Server exited. Restarting in 3s..."
    sleep 3
done
