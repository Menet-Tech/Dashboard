#!/bin/bash
# ==============================================================================
# Script Name: monitor-chrome.sh
# Description: Monitors Chrome/Chromium processes spawned by WhatsApp Gateway.
#              If any Chrome process is consuming excessive RAM (> CHROME_RAM_LIMIT_MB),
#              it sends SIGTERM to that specific process and notifies Discord.
#
# SAFETY: This script only kills Chrome renderer/browser sub-processes that are
#         clearly consuming memory above the threshold. It does NOT touch the
#         Node.js (server.js) process itself — systemd will handle restarts cleanly.
#
# Installation (as root):
#   cp monitor-chrome.sh /usr/local/bin/menettech-monitor-chrome
#   chmod +x /usr/local/bin/menettech-monitor-chrome
#
# Add to root crontab:
#   */10 * * * * /usr/local/bin/menettech-monitor-chrome >> /var/log/menettech-monitor-chrome.log 2>&1
# ==============================================================================

set -uo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
# Memory threshold in MB — Chrome processes using MORE than this will be killed.
# With 1GB RAM, set conservatively at 250MB to leave headroom for Node + system.
CHROME_RAM_LIMIT_MB="${CHROME_RAM_LIMIT_MB:-250}"

# Discord webhook URL. Loaded from environment or .env file.
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

# Path to load environment variables from (for cron context where env may be bare)
ENV_FILE="/opt/menettech-go/integration/whatsapp/.env"
if [[ -z "${DISCORD_WEBHOOK_URL}" && -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    DISCORD_WEBHOOK_URL=$(grep -E "^DISCORD_WEBHOOK_URL=" "${ENV_FILE}" | cut -d= -f2- | tr -d '"' | tr -d "'" | head -n1 || true)
fi

# ─── Helper: send Discord notification ────────────────────────────────────────
notify_discord() {
    local message="$1"
    if [[ -z "${DISCORD_WEBHOOK_URL}" ]]; then
        return
    fi
    local payload
    payload=$(printf '{"content": "%s"}' "$(echo "${message}" | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')")
    curl -s -X POST -H "Content-Type: application/json" \
        -d "${payload}" \
        "${DISCORD_WEBHOOK_URL}" > /dev/null 2>&1 || true
}

# ─── Main logic ───────────────────────────────────────────────────────────────
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[${TIMESTAMP}] monitor-chrome: Starting check (threshold: ${CHROME_RAM_LIMIT_MB}MB)"

KILLED_ANY=false

# Find Chrome processes associated with our Puppeteer cache or whatsapp-web.js
# VSZ is virtual, RSS is the actual physical RAM used. We check RSS (column 6 in ps aux).
while IFS= read -r line; do
    PID=$(echo "${line}" | awk '{print $2}')
    # RSS in ps aux is in KB
    RSS_KB=$(echo "${line}" | awk '{print $6}')
    RSS_MB=$(( RSS_KB / 1024 ))
    CMDLINE=$(echo "${line}" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}' | cut -c1-120)

    if [[ "${RSS_MB}" -gt "${CHROME_RAM_LIMIT_MB}" ]]; then
        echo "[${TIMESTAMP}] ALERT: Chrome PID ${PID} using ${RSS_MB}MB (limit: ${CHROME_RAM_LIMIT_MB}MB) — CMD: ${CMDLINE}"
        echo "[${TIMESTAMP}] Sending SIGTERM to PID ${PID}..."
        # Send SIGTERM first (graceful) — Chrome has 10s before SIGKILL
        kill -TERM "${PID}" 2>/dev/null || true
        sleep 10
        # If still alive, SIGKILL
        if kill -0 "${PID}" 2>/dev/null; then
            echo "[${TIMESTAMP}] PID ${PID} still alive after SIGTERM — sending SIGKILL"
            kill -9 "${PID}" 2>/dev/null || true
        fi
        echo "[${TIMESTAMP}] PID ${PID} terminated."
        KILLED_ANY=true
        notify_discord "⚠️ **[Menet-Tech Monitor]** Chrome zombie ditemukan dan dihentikan.\nPID: \`${PID}\` | RAM: \`${RSS_MB}MB\` (batas: \`${CHROME_RAM_LIMIT_MB}MB\`)\nCMD: \`${CMDLINE}\`\n\nWhatsApp Gateway akan reconnect otomatis."
    else
        echo "[${TIMESTAMP}] OK: Chrome PID ${PID} using ${RSS_MB}MB (within limit)"
    fi
done < <(ps aux | grep -E '(chrome|chromium)' | grep -v grep | grep -v 'monitor-chrome')

if [[ "${KILLED_ANY}" = false ]]; then
    echo "[${TIMESTAMP}] monitor-chrome: No bloated Chrome processes found. All OK."
fi

echo "[${TIMESTAMP}] monitor-chrome: Check complete."
