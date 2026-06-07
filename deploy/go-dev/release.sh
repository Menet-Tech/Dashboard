#!/usr/bin/env bash
################################################################################
# Menet-Tech Dashboard Go - Linux Production Release Packager (Bash version)
#
# Penggunaan:
#   chmod +x release.sh
#   ./release.sh
#
# Kegunaan:
#   Script ini berjalan di mesin development (dengan Go & Node.js terinstall)
#   untuk memproduksi paket rilis mandiri (offline release bundle) yang
#   siap di-upload ke server Ubuntu.
#
# Menghasilkan:
#   - deploy/go-dev/dist/menettech-release.tar.gz
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"
TEMP_RELEASE_DIR="${DIST_DIR}/release_temp"

echo "=========================================================="
echo " Packaging Menet-Tech Dashboard Go (Linux Target) "
echo "=========================================================="

# 1. Bersihkan dist sebelumnya
echo "🧹 [1/6] Cleaning up previous builds..."
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"
mkdir -p "${TEMP_RELEASE_DIR}"

# 2. Jalankan Backend Tests
echo "🧪 [2/6] Running backend tests..."
(cd "${ROOT_DIR}/backend" && go test ./... -timeout 120s)

# 3. Cross-Compile Backend (Linux amd64)
echo "🚀 [3/6] Cross-compiling backend binaries for Linux (amd64)..."
mkdir -p "${TEMP_RELEASE_DIR}/backend"

echo "  -> Compiling API & Worker (menettech-go)..."
GOOS=linux GOARCH=amd64 go build -C "${ROOT_DIR}/backend" -ldflags="-s -w" -o "${TEMP_RELEASE_DIR}/backend/menettech-go" ./cmd/api

echo "  -> Compiling Discord Bot (menettech-go-discord)..."
GOOS=linux GOARCH=amd64 go build -C "${ROOT_DIR}/backend" -ldflags="-s -w" -o "${TEMP_RELEASE_DIR}/backend/menettech-go-discord" ./cmd/discord-bot

# 4. Build Frontend
echo "📦 [4/6] Building frontend static assets..."
(
    cd "${ROOT_DIR}/frontend"
    if [[ ! -d "node_modules" ]]; then
        echo "  -> Installing node_modules..."
        npm install
    fi
    npm run build
)
mkdir -p "${TEMP_RELEASE_DIR}/frontend-dist"
cp -r "${ROOT_DIR}/frontend/dist"/* "${TEMP_RELEASE_DIR}/frontend-dist/"

# 5. Pack WhatsApp Gateway (tanpa node_modules/cache/db)
echo "💬 [5/6] Packing WhatsApp Gateway source code..."
mkdir -p "${TEMP_RELEASE_DIR}/whatsapp"
rsync -a --exclude="node_modules" --exclude=".jest-cache" --exclude="coverage" --exclude="storage" --exclude="*.log" "${ROOT_DIR}/whatsapp/" "${TEMP_RELEASE_DIR}/whatsapp/"

# Salin install-linux.sh dan systemd templates
mkdir -p "${TEMP_RELEASE_DIR}/deploy"
cp "${SCRIPT_DIR}/install-linux.sh" "${TEMP_RELEASE_DIR}/deploy/"
cp "${SCRIPT_DIR}"/*.service "${TEMP_RELEASE_DIR}/deploy/"

# 6. Buat Archive Tarball
echo "📦 [6/6] Creating final tarball..."
tar -C "${TEMP_RELEASE_DIR}" -czf "${DIST_DIR}/menettech-release.tar.gz" .

# Bersihkan temporary folder
rm -rf "${TEMP_RELEASE_DIR}"

echo "=========================================================="
echo "🎉 Build selesai!"
echo "File rilis siap di-upload ke server Ubuntu:"
echo "👉 ${DIST_DIR}/menettech-release.tar.gz"
echo "=========================================================="
