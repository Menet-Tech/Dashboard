#!/usr/bin/env bash
################################################################################
# Menet-Tech Production Installer for Custom Release Bundle
# 
# Usage:
#   chmod +x Linux-installer.sh
#   sudo ./Linux-installer.sh
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/opt/menettech-go"
SERVICE_USER="menettech"
SERVICE_GROUP="menettech"
LOG_FILE="$(pwd)/installation.log"

log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
log_error()   { echo -e "${RED}[✗]${NC} $*"; }

# ── Redirect ALL output (stdout + stderr) ke terminal DAN log file ──────────
exec > >(tee -a "${LOG_FILE}") 2>&1

# ── Trap: cetak baris yang gagal ke log jika set -e memicu exit ─────────────
trap 'echo -e "\n[FATAL] Instalasi GAGAL pada baris ${LINENO}. Periksa ${LOG_FILE} untuk detail." >&2' ERR

echo "================================================================" 
echo " Menet-Tech Linux Installer - $(date '+%Y-%m-%d %H:%M:%S %Z')" 
echo " Log disimpan di: ${LOG_FILE}"
echo "================================================================"

# 1. Validation & Dependency Installation
if [[ $EUID -ne 0 ]]; then
    log_error "Script ini harus dijalankan sebagai root (gunakan: sudo ./Linux-installer.sh)"
    exit 1
fi

log_info "Memulai instalasi dependensi sistem untuk VM baru..."

# Update apt-get
log_info "Mengupdate package list index (apt-get update)..."
apt-get update -y

# Install standard utilities
log_info "Menginstal utilitas dasar (curl, wget, unzip, git, sqlite3, build-essential)..."
apt-get install -y curl wget unzip git sqlite3 ca-certificates build-essential

# Install Node.js if missing
if ! command -v node &> /dev/null; then
    log_info "Node.js tidak terdeteksi. Mengunduh dan menginstal Node.js v20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    log_success "Node.js $(node -v) dan npm $(npm -v) berhasil diinstal."
else
    log_info "Node.js sudah terpasang: $(node -v)"
fi

# Install Puppeteer system dependencies (compatible with Ubuntu 20.04/22.04/24.04)
log_info "Menginstal dependensi grafis untuk headless Chromium (Puppeteer)..."
# libasound2 renamed to libasound2t64 on Ubuntu 24.04+; libgconf-2-4 removed on 22.04+
apt-get install -y libxss1 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libxfixes3 libxkbcommon0 || true
# Try both package names for libasound
apt-get install -y libasound2 2>/dev/null || apt-get install -y libasound2t64 2>/dev/null || true
log_success "Seluruh dependensi sistem berhasil diinstal!"

# 2. Setup User & Group
log_info "Setup system user: ${SERVICE_USER}"
if ! id "${SERVICE_USER}" &>/dev/null 2>&1; then
    useradd -r -s /bin/bash -d "${INSTALL_DIR}" -m "${SERVICE_USER}"
    log_success "User ${SERVICE_USER} berhasil dibuat"
else
    log_warn "User ${SERVICE_USER} sudah tersedia"
fi

# 3. Create Directory Structure
log_info "Membuat directory structure di ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"/{backend/storage/{uploads,Backup},frontend,integration/whatsapp}

# 4. Copy Release Files (assuming script is run in extracted release folder root)
log_info "Menyalin file rilis ke direktori instalasi..."

# Go backend
if [[ -f "./backend/api" ]]; then
    cp "./backend/api" "${INSTALL_DIR}/backend/"
    chmod +x "${INSTALL_DIR}/backend/api"
fi
if [[ -f "./backend/worker" ]]; then
    cp "./backend/worker" "${INSTALL_DIR}/backend/"
    chmod +x "${INSTALL_DIR}/backend/worker"
elif [[ -f "./worker" ]]; then
    cp "./worker" "${INSTALL_DIR}/backend/"
    chmod +x "${INSTALL_DIR}/backend/worker"
fi

# Go backend configuration
if [[ ! -f "${INSTALL_DIR}/backend/.env" ]]; then
    if [[ -f "./backend/.env" ]]; then
        cp "./backend/.env" "${INSTALL_DIR}/backend/"
        log_success "Konfigurasi .env disalin ke ${INSTALL_DIR}/backend/.env"
    elif [[ -f "./backend/.env.example" ]]; then
        cp "./backend/.env.example" "${INSTALL_DIR}/backend/.env"
        log_warn "Membuat file .env baru dari .env.example di ${INSTALL_DIR}/backend/.env"
    fi
else
    log_info "File ${INSTALL_DIR}/backend/.env sudah ada. Melewati penyalinan."
fi

# Frontend
if [[ -d "./frontend" ]]; then
    # Use find+cp to avoid nullglob issue with set -e when folder is empty
    find ./frontend -maxdepth 1 -mindepth 1 -exec cp -r {} "${INSTALL_DIR}/frontend/" \;
elif [[ -d "./Frontend/frontend" ]]; then
    find ./Frontend/frontend -maxdepth 1 -mindepth 1 -exec cp -r {} "${INSTALL_DIR}/frontend/" \;
fi

# Integration
if [[ -f "./integration/discord-bot" ]]; then
    cp "./integration/discord-bot" "${INSTALL_DIR}/integration/"
    chmod +x "${INSTALL_DIR}/integration/discord-bot"
elif [[ -f "./Intergration/discord-bot" ]]; then
    cp "./Intergration/discord-bot" "${INSTALL_DIR}/integration/"
    chmod +x "${INSTALL_DIR}/integration/discord-bot"
fi

if [[ ! -f "${INSTALL_DIR}/integration/.env" ]]; then
    if [[ -f "./integration/.env" ]]; then
        cp "./integration/.env" "${INSTALL_DIR}/integration/"
        log_success "Konfigurasi .env disalin ke ${INSTALL_DIR}/integration/.env"
    elif [[ -f "./integration/.env.example" ]]; then
        cp "./integration/.env.example" "${INSTALL_DIR}/integration/.env"
        log_warn "Membuat file .env baru dari .env.example di ${INSTALL_DIR}/integration/.env"
    fi
else
    log_info "File ${INSTALL_DIR}/integration/.env sudah ada. Melewati penyalinan."
fi

if [[ -d "./integration/whatsapp" ]]; then
    cp -r ./integration/whatsapp/* "${INSTALL_DIR}/integration/whatsapp/"
elif [[ -d "./Intergration/Whatsapp" ]]; then
    cp -r ./Intergration/Whatsapp/* "${INSTALL_DIR}/integration/whatsapp/"
fi

if [[ ! -f "${INSTALL_DIR}/integration/whatsapp/.env" ]]; then
    if [[ -f "${INSTALL_DIR}/integration/whatsapp/.env.example" ]]; then
        cp "${INSTALL_DIR}/integration/whatsapp/.env.example" "${INSTALL_DIR}/integration/whatsapp/.env"
        log_warn "Membuat file .env baru dari .env.example di ${INSTALL_DIR}/integration/whatsapp/.env"
    fi
fi

# 5. Install Node Dependencies for WhatsApp Gateway
log_info "Menginstall Node dependencies untuk WhatsApp Gateway..."
(
    cd "${INSTALL_DIR}/integration/whatsapp"
    if command -v npm &> /dev/null; then
        # npm ci requires package-lock.json (deterministic); fallback to npm install
        # --omit=dev is the modern replacement for --production (npm v7+)
        if [[ -f "package-lock.json" ]]; then
            npm ci --omit=dev
        else
            npm install --omit=dev
        fi
    else
        log_error "npm tidak ditemukan. Silakan jalankan npm install manual di ${INSTALL_DIR}/integration/whatsapp setelah instalasi selesai."
    fi
)

# 6. Apply Permissions
log_info "Mengatur kepemilikan dan izin folder..."
chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}"
chmod 755 "${INSTALL_DIR}"
chmod -R 700 "${INSTALL_DIR}/backend/storage"

# 6b. Interactive .env configuration check
echo -e "\n${YELLOW}========================================================================${NC}"
echo -e "${YELLOW}🔔 KONFIGURASI DIKUNCI SEMENTARA: UBAH FILE .env BERIKUT${NC}"
echo -e "${YELLOW}========================================================================${NC}"
echo -e "Aplikasi telah disalin, tetapi Anda perlu melengkapi konfigurasi .env."
echo -e "Silakan buka sesi terminal lain dan sesuaikan file berikut:"
echo -e "1. Backend & Worker:"
echo -e "   👉 ${GREEN}nano ${INSTALL_DIR}/backend/.env${NC}"
echo -e "2. Discord Bot:"
echo -e "   👉 ${GREEN}nano ${INSTALL_DIR}/integration/.env${NC}"
echo -e "3. WhatsApp Gateway:"
echo -e "   👉 ${GREEN}nano ${INSTALL_DIR}/integration/whatsapp/.env${NC}"
echo -e "\n*Catatan: Frontend sudah terkompilasi statis (tidak perlu .env di server).* "
echo -e "${YELLOW}========================================================================${NC}"

read -p "Apakah Anda sudah melengkapi semua berkas .env tersebut? (y/N): " choice
if [[ "$choice" =~ ^[Yy]$ ]]; then
    log_success "Melanjutkan registrasi dan menjalankan systemd services..."
else
    log_warn "Proses instalasi dihentikan sementara."
    log_warn "Setelah melengkapi berkas .env di atas, Anda dapat mengaktifkan layanan manual dengan:"
    log_warn "👉 sudo systemctl daemon-reload"
    log_warn "👉 sudo systemctl restart menettech-api menettech-worker menettech-discord menettech-whatsapp"
    exit 0
fi

# 7. Configure Systemd Services
log_info "Memasang systemd service files..."
SERVICES=("menettech-api.service" "menettech-worker.service" "menettech-discord.service" "menettech-whatsapp.service")
for svc in "${SERVICES[@]}"; do
    if [[ -f "./deploy/${svc}" ]]; then
        cp "./deploy/${svc}" /etc/systemd/system/
    elif [[ -f "./deploy/production/${svc}" ]]; then
        cp "./deploy/production/${svc}" /etc/systemd/system/
    else
        log_warn "File service ${svc} tidak ditemukan di folder deploy."
    fi
done

log_info "Reloading systemd daemon..."
systemctl daemon-reload

# Enable & Start Services
log_info "Mengaktifkan dan menjalankan layanan..."
for svc in "${SERVICES[@]}"; do
    systemctl enable "${svc}" || true
    systemctl restart "${svc}" || true
done

log_success "Instalasi selesai!"
echo "--------------------------------------------------------"
echo "Status Layanan:"
for svc in "${SERVICES[@]}"; do
    status=$(systemctl is-active "${svc}" || echo "inactive")
    echo " - ${svc}: ${status}"
done
echo "--------------------------------------------------------"
echo "Untuk melihat log aktivitas secara langsung:"
echo "👉 journalctl -u menettech-api.service -f"
echo "👉 journalctl -u menettech-whatsapp.service -f"
echo "👉 cat ${LOG_FILE}"
echo "--------------------------------------------------------"
echo ""
echo "================================================================"
echo " Instalasi selesai pada: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo " Log lengkap tersimpan di: ${LOG_FILE}"
echo "================================================================"
