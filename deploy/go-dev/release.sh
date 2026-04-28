#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST_DIR="${ROOT_DIR}/deploy/go-dev/dist"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"

mkdir -p "${DIST_DIR}"

echo "[1/5] Running backend tests..."
(cd "${BACKEND_DIR}" && go test ./... -timeout 120s)

echo "[2/5] Building backend binary..."
(cd "${BACKEND_DIR}" && go build -o "${DIST_DIR}/menettech-go" ./cmd/api)

echo "[3/5] Building frontend..."
(cd "${FRONTEND_DIR}" && npm ci && npm run build)

echo "[4/5] Packing frontend dist..."
rm -f "${DIST_DIR}/frontend-dist.tar.gz"
tar -C "${FRONTEND_DIR}" -czf "${DIST_DIR}/frontend-dist.tar.gz" dist

echo "[5/5] Writing checksums..."
(cd "${DIST_DIR}" && sha256sum menettech-go frontend-dist.tar.gz > SHA256SUMS.txt)

echo "Release artifacts available at: ${DIST_DIR}"
