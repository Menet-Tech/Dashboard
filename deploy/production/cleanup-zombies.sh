#!/bin/bash
# ==============================================================================
# Script Name: cleanup-zombies.sh
# Description: Kills zombie Chrome and Node processes for Menet-Tech API
# Usage: Run this on the production server as root
# ==============================================================================

echo "[1/3] Stopping the main API service gracefully..."
systemctl stop menettech-api.service 2>/dev/null || echo "Service not found or already stopped."

echo "[2/3] Hunting down zombie Chrome and Puppeteer processes..."
# Find and kill any chrome instances spawned by puppeteer from our cache directory
CHROME_PIDS=$(ps aux | grep '/opt/menettech-go/.cache/puppeteer/chrome' | grep -v grep | awk '{print $2}')

if [ -z "$CHROME_PIDS" ]; then
    echo "  -> No zombie Chrome processes found."
else
    echo "  -> Found zombie Chrome PIDs: $CHROME_PIDS"
    echo "  -> Sending SIGTERM..."
    kill $CHROME_PIDS 2>/dev/null
    sleep 3
    echo "  -> Sending SIGKILL to stubborn processes..."
    kill -9 $CHROME_PIDS 2>/dev/null
    echo "  -> Zombie Chrome processes eliminated."
fi

# Also ensure no stray node processes for server.js are hanging around
NODE_PIDS=$(ps aux | grep 'node.*src/server.js' | grep -v grep | awk '{print $2}')
if [ -n "$NODE_PIDS" ]; then
    echo "  -> Found stray Node processes: $NODE_PIDS"
    kill -9 $NODE_PIDS 2>/dev/null
    echo "  -> Stray Node processes eliminated."
fi

echo "[3/3] Clearing SQLite temporary WAL/SHM locks (if any)..."
# If the processes were killed abruptly, SQLite might leave behind lock files.
# We don't delete the main wa_gateway.db, just the wal/shm if the service is off.
rm -f /opt/menettech-go/integration/whatsapp/wa_gateway.db-shm
rm -f /opt/menettech-go/integration/whatsapp/wa_gateway.db-wal

echo "Cleanup complete! The environment is clean."
echo "You can now safely restart the service using:"
echo "  systemctl start menettech-api.service"
