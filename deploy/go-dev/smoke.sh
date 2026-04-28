#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8080}"

echo "Smoke check base URL: ${BASE_URL}"

curl -fsS "${BASE_URL}/livez" >/dev/null && echo "OK /livez"
curl -fsS "${BASE_URL}/readyz" >/dev/null && echo "OK /readyz"

HEALTH_JSON="$(curl -fsS "${BASE_URL}/health")"
echo "${HEALTH_JSON}" | rg '"status"' >/dev/null
echo "OK /health payload"

echo "Smoke checks passed."
