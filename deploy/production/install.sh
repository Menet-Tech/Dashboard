#!/usr/bin/env bash
################################################################################
# Menet-Tech Production Installer
#
# Usage:
#   chmod +x Linux-installer.sh
#   sudo ./Linux-installer.sh
#
# Yang dilakukan script ini:
#   1. Install semua dependensi sistem (Node.js, nginx, puppeteer libs)
#   2. Buat user sistem 'menettech'
#   3. Salin semua file ke /opt/menettech-go/
#   4. Buat .env backend otomatis (IP server terdeteksi otomatis)
#   5. Install node_modules & download Chrome untuk WhatsApp Gateway
#   6. Konfigurasi nginx sebagai reverse proxy (port 80)
#   7. Pasang dan jalankan semua systemd services
#   8. Tampilkan panduan akses
################################################################################

set -euo pipefail

# ─── Warna output ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/menettech-go"
SERVICE_USER="menettech"
SERVICE_GROUP="menettech"
NGINX_CONF="/etc/nginx/sites-available/menettech"

log_info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
log_success() { echo -e "${GREEN}[✓]${NC}      $*"; }
log_warn()    { echo -e "${YELLOW}[!]${NC}      $*"; }
log_error()   { echo -e "${RED}[✗]${NC}      $*"; exit 1; }
log_step()    { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }

# ─── Harus root ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}[✗] Script ini harus dijalankan sebagai root:${NC}"
    echo -e "    sudo ./Linux-installer.sh"
    exit 1
fi

# ─── Parse Flags ───────────────────────────────────────────────────────────────
UPDATE_MODE=false
for arg in "$@"; do
    if [[ "$arg" == "--update" ]] || [[ "$arg" == "-u" ]]; then
        UPDATE_MODE=true
    fi
done

# ─── Deteksi IP Server dari 'ip a' (antarmuka ke-2, non-loopback) ─────────────
SERVER_IP=$(ip -4 addr show scope global | awk '/inet /{split($2, a, "/"); if (a[1] != "") {print a[1]; exit}}')
if [[ -z "${SERVER_IP}" ]]; then
    SERVER_IP="127.0.0.1"
    log_warn "IP server tidak terdeteksi otomatis, menggunakan 127.0.0.1 sebagai fallback."
else
    log_success "IP server terdeteksi: ${SERVER_IP}"
fi

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║    Menet-Tech Dashboard Go - Production Installer    ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo -e "  Install dir : ${INSTALL_DIR}"
echo -e "  Server IP   : ${SERVER_IP}"
echo -e "  Service user: ${SERVICE_USER}"
echo ""

if [[ "${UPDATE_MODE}" == "false" ]]; then
    # ─── Input password admin sebelum instalasi dimulai ───────────────────────────
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}🔐 PENGATURAN PASSWORD ADMIN DASHBOARD${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "Password ini akan digunakan untuk login pertama ke dashboard."
    echo -e "Minimal 8 karakter."
    echo ""
    while true; do
        read -r -s -p "Masukkan password admin : " ADMIN_PASSWORD
        echo ""
        if [[ -z "${ADMIN_PASSWORD}" ]]; then
            echo -e "${RED}Password tidak boleh kosong.${NC}"
            continue
        fi
        if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
            echo -e "${RED}Password minimal 8 karakter.${NC}"
            continue
        fi
        read -r -s -p "Konfirmasi password      : " ADMIN_PASSWORD_CONFIRM
        echo ""
        if [[ "${ADMIN_PASSWORD}" != "${ADMIN_PASSWORD_CONFIRM}" ]]; then
            echo -e "${RED}Password tidak cocok! Silakan coba lagi.${NC}"
            continue
        fi
        break
    done
    log_success "Password admin berhasil diatur"
    echo ""

    # ─── Konfigurasi nginx: domain name ──────────────────────────────────
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}🌐 KONFIGURASI NGINX (Web Server)${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "Jika menggunakan domain (misal: dashboard.menet.my.id), isi di bawah."
    echo -e "Jika hanya pakai IP server, kosongkan saja (tekan Enter)."
    echo ""
    read -r -p "Domain name (kosongkan jika pakai IP): " DOMAIN_INPUT
    if [[ -n "${DOMAIN_INPUT}" ]]; then
        DOMAIN_NAME="${DOMAIN_INPUT}"
        log_success "Domain dikonfigurasi: ${DOMAIN_NAME}"
    else
        DOMAIN_NAME="${SERVER_IP}"
        log_info "Menggunakan IP server sebagai server_name: ${DOMAIN_NAME}"
    fi
    echo ""

    # ─── Tanya HTTPS / certbot ───────────────────────────────────────────
    SETUP_HTTPS="n"
    if [[ "${DOMAIN_NAME}" != "${SERVER_IP}" ]]; then
        echo -e "Domain terdeteksi. Aktifkan HTTPS otomatis dengan Let's Encrypt (certbot)?"
        echo -e "${YELLOW}Catatan: Domain harus sudah diarahkan (DNS A record) ke IP ${SERVER_IP} terlebih dahulu.${NC}"
        read -r -p "Setup HTTPS dengan certbot? (y/N): " https_choice
        if [[ "${https_choice}" =~ ^[Yy]$ ]]; then
            SETUP_HTTPS="y"
            read -r -p "Email untuk notifikasi Let's Encrypt (opsional, tekan Enter untuk skip): " LE_EMAIL
            log_success "HTTPS akan dikonfigurasi setelah nginx berjalan"
        else
            log_info "Melewati setup HTTPS."
        fi
    else
        log_info "HTTPS memerlukan domain name, bukan IP. Melewati setup HTTPS."
    fi
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════════════════════
log_step "1/8 - Install Dependensi Sistem"
# ══════════════════════════════════════════════════════════════════════════════
if [[ "${UPDATE_MODE}" == "false" ]]; then
    log_info "Mengupdate package list..."
    apt-get update -y -q

    log_info "Menginstal utilitas dasar..."
    apt-get install -y -q curl wget unzip git sqlite3 ca-certificates build-essential iproute2

    log_info "Menginstal nginx..."
    apt-get install -y -q nginx
    log_success "nginx terinstal"

    # ─── Node.js v20 LTS ──────────────────────────────────────────────────────────
    if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 18 ]]; then
        log_info "Menginstal Node.js v20 LTS..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
        apt-get install -y -q nodejs
        log_success "Node.js $(node -v) & npm $(npm -v) terinstal"
    else
        log_info "Node.js sudah terpasang: $(node -v)"
    fi

    # ─── Puppeteer / Chromium system libraries ────────────────────────────────────
    log_info "Menginstal library sistem untuk Chromium (Puppeteer)..."
    # Package names compatible across Ubuntu 20.04 / 22.04 / 24.04
    apt-get install -y -q \
        libxss1 libatk1.0-0 libatk-bridge2.0-0 \
        libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3 \
        libdrm2 libxcomposite1 libxdamage1 libxrandr2 \
        libxfixes3 libxkbcommon0 libpango-1.0-0 libcairo2 \
        fonts-liberation libappindicator3-1 libasound2t64 2>/dev/null \
        || apt-get install -y -q libasound2 2>/dev/null || true
    log_success "Library sistem untuk Chromium terinstal"
else
    log_info "Mode update aktif: Melewati penginstalan dependensi sistem..."
fi

# ══════════════════════════════════════════════════════════════════════════════
log_step "2/8 - Setup User Sistem"
# ══════════════════════════════════════════════════════════════════════════════
if ! id "${SERVICE_USER}" &>/dev/null; then
    useradd -r -s /bin/bash -d "${INSTALL_DIR}" -m "${SERVICE_USER}"
    log_success "User '${SERVICE_USER}' berhasil dibuat"
else
    log_warn "User '${SERVICE_USER}' sudah tersedia, melewati pembuatan."
fi

# ══════════════════════════════════════════════════════════════════════════════
log_step "3/8 - Buat Struktur Direktori"
# ══════════════════════════════════════════════════════════════════════════════
mkdir -p "${INSTALL_DIR}"/{backend/storage/{uploads,Backup},frontend,integration/whatsapp}
log_success "Struktur direktori di ${INSTALL_DIR} siap"

# ══════════════════════════════════════════════════════════════════════════════
log_step "4/8 - Salin File Rilis"
# ══════════════════════════════════════════════════════════════════════════════
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Stop Services Sebelum Update Binary (Text file busy prevention) ───────────
if [[ "${UPDATE_MODE}" == "true" ]]; then
    log_info "Menghentikan layanan backend aktif untuk update binary..."
    if systemctl is-active --quiet menettech-api 2>/dev/null; then
        systemctl stop menettech-api || true
    fi
    if systemctl is-active --quiet menettech-worker 2>/dev/null; then
        systemctl stop menettech-worker || true
    fi
fi

# ─── Backend binary ───────────────────────────────────────────────────────────
if [[ -f "${SCRIPT_DIR}/backend/api" ]]; then
    cp "${SCRIPT_DIR}/backend/api"    "${INSTALL_DIR}/backend/"
    cp "${SCRIPT_DIR}/backend/api"    "${INSTALL_DIR}/backend/worker"
    chmod +x "${INSTALL_DIR}/backend/api" "${INSTALL_DIR}/backend/worker"
    log_success "Binary backend (api, worker) disalin"
else
    log_error "File backend/api tidak ditemukan di ${SCRIPT_DIR}/backend/. Pastikan script dijalankan dari folder release."
fi

# ─── Backend .env (hanya buat jika belum ada) ────────────────────────────────
if [[ ! -f "${INSTALL_DIR}/backend/.env" ]]; then
    if [[ -f "${SCRIPT_DIR}/backend/.env.example" ]]; then
        cp "${SCRIPT_DIR}/backend/.env.example" "${INSTALL_DIR}/backend/.env"
        sed -i "s|SQLITE_PATH=.*|SQLITE_PATH=${INSTALL_DIR}/backend/storage/dashboard.db|g" "${INSTALL_DIR}/backend/.env"
        sed -i "s|STORAGE_PATH=.*|STORAGE_PATH=${INSTALL_DIR}/backend/storage|g"            "${INSTALL_DIR}/backend/.env"
        sed -i "s|FRONTEND_DIST_PATH=.*|FRONTEND_DIST_PATH=${INSTALL_DIR}/frontend|g"       "${INSTALL_DIR}/backend/.env"
        # Terapkan password yang sudah diinput sebelumnya
        # Escape karakter khusus di password agar aman untuk sed
        ADMIN_PASSWORD_ESCAPED=$(printf '%s\n' "${ADMIN_PASSWORD}" | sed 's/[\&/|]/\\&/g')
        sed -i "s|BOOTSTRAP_ADMIN_PASSWORD=.*|BOOTSTRAP_ADMIN_PASSWORD=${ADMIN_PASSWORD_ESCAPED}|g" "${INSTALL_DIR}/backend/.env"
        # ─── Auto-generate JWT_SECRET (wajib untuk keamanan produksi) ─────────
        JWT_SECRET_VAL=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET_VAL}|g" "${INSTALL_DIR}/backend/.env"
        log_success "JWT_SECRET di-generate otomatis (random 256-bit)"
        log_success "File .env backend dibuat, password admin telah diset"
    fi
else
    log_info "File .env backend sudah ada, melewati penyalinan."
    log_warn "Password yang Anda input tidak diterapkan ke .env yang sudah ada."
    # ─── Patch JWT_SECRET jika masih kosong/lemah di .env lama ───────────────
    EXISTING_JWT=$(grep -E '^JWT_SECRET=' "${INSTALL_DIR}/backend/.env" | cut -d'=' -f2- | tr -d ' ')
    if [[ -z "${EXISTING_JWT}" ]] || [[ "${EXISTING_JWT}" == "your-secret-key" ]] || [[ "${EXISTING_JWT}" == "change-me" ]] || [[ ${#EXISTING_JWT} -lt 32 ]]; then
        JWT_SECRET_VAL=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET_VAL}|g" "${INSTALL_DIR}/backend/.env"
        log_success "JWT_SECRET lama kosong/tidak aman — di-generate ulang otomatis"
    else
        log_info "JWT_SECRET sudah ada, melewati regenerasi."
    fi
fi

# ─── Frontend (static files) ─────────────────────────────────────────────────
if [[ -d "${SCRIPT_DIR}/frontend" ]] && [[ -n "$(ls -A "${SCRIPT_DIR}/frontend" 2>/dev/null)" ]]; then
    cp -r "${SCRIPT_DIR}/frontend/." "${INSTALL_DIR}/frontend/"
    log_success "File frontend disalin ke ${INSTALL_DIR}/frontend/"
else
    log_warn "Folder frontend tidak ditemukan atau kosong."
fi

# ─── Discord Bot binary ───────────────────────────────────────────────────────
if [[ -f "${SCRIPT_DIR}/integration/discord-bot" ]]; then
    cp "${SCRIPT_DIR}/integration/discord-bot" "${INSTALL_DIR}/integration/"
    chmod +x "${INSTALL_DIR}/integration/discord-bot"
    log_success "Binary discord-bot disalin"
fi

# ─── Discord Bot .env (hanya buat jika belum ada) ────────────────────────────
if [[ ! -f "${INSTALL_DIR}/integration/.env" ]]; then
    if [[ -f "${SCRIPT_DIR}/integration/.env.example" ]]; then
        cp "${SCRIPT_DIR}/integration/.env.example" "${INSTALL_DIR}/integration/.env"
        sed -i "s|SQLITE_PATH=.*|SQLITE_PATH=${INSTALL_DIR}/backend/storage/dashboard.db|g" "${INSTALL_DIR}/integration/.env"
        log_success "File .env discord-bot dibuat"
        log_warn "Isi DISCORD_BOT_TOKEN dan DISCORD_APPLICATION_ID di ${INSTALL_DIR}/integration/.env (atau lewat Settings UI)"
    fi
else
    log_info "File .env discord-bot sudah ada, melewati penyalinan."
fi

# ─── WhatsApp Gateway source ─────────────────────────────────────────────────
if [[ -d "${SCRIPT_DIR}/integration/whatsapp" ]] && [[ -n "$(ls -A "${SCRIPT_DIR}/integration/whatsapp" 2>/dev/null)" ]]; then
    cp -r "${SCRIPT_DIR}/integration/whatsapp/." "${INSTALL_DIR}/integration/whatsapp/"
    log_success "Source WhatsApp Gateway disalin"
else
    log_warn "Folder integration/whatsapp tidak ditemukan atau kosong."
fi

# ─── WhatsApp .env (hanya buat jika belum ada) ───────────────────────────────
if [[ ! -f "${INSTALL_DIR}/integration/whatsapp/.env" ]]; then
    if [[ -f "${INSTALL_DIR}/integration/whatsapp/.env.example" ]]; then
        cp "${INSTALL_DIR}/integration/whatsapp/.env.example" "${INSTALL_DIR}/integration/whatsapp/.env"
        # Sesuaikan URL dashboard API dan public URL otomatis
        sed -i "s|DASHBOARD_API_URL=.*|DASHBOARD_API_URL=http://127.0.0.1:8080|g"  "${INSTALL_DIR}/integration/whatsapp/.env"
        sed -i "s|PUBLIC_URL=.*|PUBLIC_URL=http://${SERVER_IP}|g"                   "${INSTALL_DIR}/integration/whatsapp/.env"
        log_success "File .env WhatsApp Gateway dibuat"
        log_warn "Isi API_KEY dan DASHBOARD_INTERNAL_API_KEY di ${INSTALL_DIR}/integration/whatsapp/.env"
    fi
else
    log_info "File .env WhatsApp Gateway sudah ada, melewati penyalinan."
fi

# ══════════════════════════════════════════════════════════════════════════════
log_step "5/8 - Install Node Modules & Download Chrome (WhatsApp)"
# ══════════════════════════════════════════════════════════════════════════════
# Perbaiki kepemilikan terlebih dahulu agar npm berjalan sebagai user yang benar
chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}"

(
    cd "${INSTALL_DIR}/integration/whatsapp"
    if command -v npm &>/dev/null; then
        log_info "Menjalankan npm install sebagai user '${SERVICE_USER}'..."
        # HOME harus menunjuk ke direktori home user agar npm cache tersimpan dengan benar
        if [[ -f "package-lock.json" ]]; then
            sudo -u "${SERVICE_USER}" HOME="${INSTALL_DIR}" npm ci --omit=dev 2>&1 || \
            sudo -u "${SERVICE_USER}" HOME="${INSTALL_DIR}" npm install --omit=dev 2>&1
        else
            sudo -u "${SERVICE_USER}" HOME="${INSTALL_DIR}" npm install --omit=dev 2>&1
        fi
        log_success "node_modules WhatsApp Gateway terinstal"

        # Download Chrome menggunakan binary puppeteer LOKAL (bukan npx global)
        # PUPPETEER_CACHE_DIR disetel eksplisit ke HOME/.cache/puppeteer agar konsisten
        log_info "Mengunduh Chrome binary untuk Puppeteer..."
        PUPPETEER_BIN="${INSTALL_DIR}/integration/whatsapp/node_modules/.bin/puppeteer"
        if [[ -f "${PUPPETEER_BIN}" ]]; then
            sudo -u "${SERVICE_USER}" \
                HOME="${INSTALL_DIR}" \
                PUPPETEER_CACHE_DIR="${INSTALL_DIR}/.cache/puppeteer" \
                "${PUPPETEER_BIN}" browsers install chrome 2>&1 && \
                log_success "Chrome binary berhasil diunduh ke ${INSTALL_DIR}/.cache/puppeteer" || \
                log_warn "Gagal mengunduh Chrome via local binary. Lihat log di atas."
        else
            log_warn "Binary puppeteer lokal tidak ditemukan (${PUPPETEER_BIN}). npm install mungkin gagal."
        fi

        # Set PUPPETEER_CACHE_DIR di .env WhatsApp agar runtime tahu path Chrome
        if [[ -f "${INSTALL_DIR}/integration/whatsapp/.env" ]]; then
            if ! grep -q "PUPPETEER_CACHE_DIR" "${INSTALL_DIR}/integration/whatsapp/.env"; then
                echo "PUPPETEER_CACHE_DIR=${INSTALL_DIR}/.cache/puppeteer" >> "${INSTALL_DIR}/integration/whatsapp/.env"
                log_success "PUPPETEER_CACHE_DIR ditambahkan ke .env WhatsApp"
            fi
        fi
    else
        log_warn "npm tidak ditemukan. Jalankan manual:\n  cd ${INSTALL_DIR}/integration/whatsapp && npm install --omit=dev\n  ./node_modules/.bin/puppeteer browsers install chrome"
    fi
)

# ──────────────────────────────────────────────────────────────────────────────
log_step "6/8 - Konfigurasi nginx (Port 80 → Reverse Proxy)"
# ──────────────────────────────────────────────────────────────────────────────
if [[ "${UPDATE_MODE}" == "false" ]]; then
    # Hapus konfigurasi default nginx
    if [[ -f /etc/nginx/sites-enabled/default ]]; then
        rm -f /etc/nginx/sites-enabled/default
    fi

    # Buat konfigurasi nginx dengan server_name dari input user
    cat > "${NGINX_CONF}" <<NGINX_EOF
server {
    listen 80;
    server_name ${DOMAIN_NAME} _;

    # Serve frontend static files langsung via nginx (performa lebih baik)
    root ${INSTALL_DIR}/frontend;
    index index.html;

    # API backend - forward ke Go API
    location /api/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        client_max_body_size 50M;
    }

    # WhatsApp Gateway API
    location /wa/ {
        proxy_pass         http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }

    # SPA fallback - semua route non-file diarahkan ke index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Upload storage
    location /storage/ {
        alias ${INSTALL_DIR}/backend/storage/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
NGINX_EOF

    # Aktifkan konfigurasi nginx
    ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/menettech

    # Validasi dan restart nginx
    if nginx -t 2>/dev/null; then
        systemctl enable nginx
        systemctl restart nginx
        log_success "nginx dikonfigurasi dan berjalan di port 80 (server_name: ${DOMAIN_NAME})"
    else
        log_warn "Konfigurasi nginx gagal divalidasi. Jalankan 'nginx -t' untuk detail."
    fi
else
    log_info "Mode update aktif: Melewati konfigurasi ulang nginx..."
fi

# ─── Setup HTTPS dengan certbot (jika dipilih) ─────────────────────────────────
if [[ "${UPDATE_MODE}" == "false" ]]; then
    # ─── Setup HTTPS dengan certbot (jika dipilih) ─────────────────────────────────
    if [[ "${SETUP_HTTPS}" == "y" ]]; then
        log_info "Menginstal certbot dan plugin nginx..."
        apt-get install -y -q certbot python3-certbot-nginx

        CERTBOT_CMD="certbot --nginx -d ${DOMAIN_NAME} --non-interactive --agree-tos --redirect"
        if [[ -n "${LE_EMAIL:-}" ]]; then
            CERTBOT_CMD+=" -m ${LE_EMAIL}"
        else
            CERTBOT_CMD+=" --register-unsafely-without-email"
        fi

        log_info "Menjalankan certbot untuk domain ${DOMAIN_NAME}..."
        if eval "${CERTBOT_CMD}"; then
            log_success "HTTPS berhasil dikonfigurasi! Dashboard dapat diakses di https://${DOMAIN_NAME}"
            # Set SESSION_COOKIE_SECURE=true karena HTTPS aktif
            if [[ -f "${INSTALL_DIR}/backend/.env" ]]; then
                sed -i "s|SESSION_COOKIE_SECURE=.*|SESSION_COOKIE_SECURE=true|g" "${INSTALL_DIR}/backend/.env"
            fi
            # Setup auto-renewal cron
            (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
            log_success "Auto-renewal SSL certificate dikonfigurasi (cron setiap hari jam 03:00)"
            ACCESS_URL="https://${DOMAIN_NAME}"
        else
            log_warn "certbot gagal. Pastikan domain ${DOMAIN_NAME} sudah mengarah ke IP ${SERVER_IP}."
            log_warn "Jalankan manual: certbot --nginx -d ${DOMAIN_NAME}"
            # Set SESSION_COOKIE_SECURE=false karena gagal HTTPS (kembali ke HTTP)
            if [[ -f "${INSTALL_DIR}/backend/.env" ]]; then
                sed -i "s|SESSION_COOKIE_SECURE=.*|SESSION_COOKIE_SECURE=false|g" "${INSTALL_DIR}/backend/.env"
            fi
            ACCESS_URL="http://${DOMAIN_NAME}"
        fi
    else
        # Set SESSION_COOKIE_SECURE=false karena hanya menggunakan HTTP
        if [[ -f "${INSTALL_DIR}/backend/.env" ]]; then
            sed -i "s|SESSION_COOKIE_SECURE=.*|SESSION_COOKIE_SECURE=false|g" "${INSTALL_DIR}/backend/.env"
        fi
        if [[ "${DOMAIN_NAME}" != "${SERVER_IP}" ]]; then
            ACCESS_URL="http://${DOMAIN_NAME}"
        else
            ACCESS_URL="http://${SERVER_IP}"
        fi
    fi
else
    log_info "Mode update aktif: Melewati certbot/HTTPS setup..."
    ACCESS_URL="http://${SERVER_IP}"
fi

# ══════════════════════════════════════════════════════════════════════════════
log_step "7/8 - Set Kepemilikan File & Permission"
# ══════════════════════════════════════════════════════════════════════════════
log_info "Mengatur kepemilikan berkas ke user '${SERVICE_USER}'..."
chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}"
chmod 755 "${INSTALL_DIR}"

log_info "Mengatur izin eksekusi pada binaries..."
if [[ -f "${INSTALL_DIR}/backend/api" ]]; then
    chmod +x "${INSTALL_DIR}/backend/api"
fi
if [[ -f "${INSTALL_DIR}/backend/worker" ]]; then
    chmod +x "${INSTALL_DIR}/backend/worker"
fi
if [[ -f "${INSTALL_DIR}/integration/discord-bot" ]]; then
    chmod +x "${INSTALL_DIR}/integration/discord-bot"
fi

chmod -R 700 "${INSTALL_DIR}/backend/storage"
# nginx perlu bisa baca frontend
chmod -R o+rX "${INSTALL_DIR}/frontend"
log_success "Permission dan kepemilikan seluruh berkas berhasil dikonfigurasi!"

# ══════════════════════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════════════════════
log_step "8/8 - Pasang & Jalankan Systemd Services"
# ══════════════════════════════════════════════════════════════════════════════
# Matikan & hapus layanan standalone lama jika ada untuk menghindari konflik port/proses
log_info "Membersihkan layanan integrasi mandiri lama (jika ada)..."
for old_svc in "menettech-discord" "menettech-whatsapp"; do
    if systemctl is-active --quiet "${old_svc}" 2>/dev/null; then
        systemctl stop "${old_svc}" 2>/dev/null || true
    fi
    if systemctl is-enabled --quiet "${old_svc}" 2>/dev/null; then
        systemctl disable "${old_svc}" 2>/dev/null || true
    fi
    rm -f "/etc/systemd/system/${old_svc}.service"
done

# Layanan utama yang didaftarkan ke systemd (discord & whatsapp dikelola sebagai subprocess api)
SERVICES=("menettech-api.service" "menettech-worker.service")
for svc in "${SERVICES[@]}"; do
    if [[ -f "${SCRIPT_DIR}/deploy/${svc}" ]]; then
        cp "${SCRIPT_DIR}/deploy/${svc}" /etc/systemd/system/
        log_success "Service file dipasang: ${svc}"
    else
        log_warn "File service tidak ditemukan: ${SCRIPT_DIR}/deploy/${svc}"
    fi
done

systemctl daemon-reload

for svc in "${SERVICES[@]}"; do
    systemctl enable "${svc}" 2>/dev/null || true
    systemctl restart "${svc}" 2>/dev/null || true
done
log_success "Seluruh layanan utama (API + Worker) berhasil dijalankan!"

# ══════════════════════════════════════════════════════════════════════════════
# RINGKASAN & PANDUAN AKSES
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║         ✓ INSTALASI BERHASIL SELESAI!               ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}📋 STATUS LAYANAN:${NC}"
for svc in "${SERVICES[@]}"; do
    status=$(systemctl is-active "${svc}" 2>/dev/null || echo "inactive")
    if [[ "${status}" == "active" ]]; then
        echo -e "   ${GREEN}●${NC} ${svc}: ${GREEN}${status}${NC}"
    else
        echo -e "   ${RED}●${NC} ${svc}: ${RED}${status}${NC}"
    fi
done
echo ""
echo -e "${BOLD}🌐 CARA AKSES DASHBOARD:${NC}"
echo -e "   Buka browser dan kunjungi:"
echo -e "   ${CYAN}${BOLD}${ACCESS_URL}${NC}"
echo ""
echo -e "${BOLD}🔐 KREDENSIAL LOGIN AWAL:${NC}"
echo -e "   Username : ${GREEN}admin${NC}"
echo -e "   Password : ${GREEN}(password yang Anda masukkan tadi)${NC}"
echo ""
echo -e "${BOLD}⚙️  KONFIGURASI INTEGRASI (LEWAT DASHBOARD UI):${NC}"
echo -e "   Setelah login, buka menu ${CYAN}Settings${NC} untuk mengatur:"
echo -e "   • MikroTik  (host, username, password)"
echo -e "   • Discord   (bot token, application ID, guild ID)"
echo -e "   • WhatsApp  (isi ADMIN_WA_NUMBERS di file .env whatsapp)"
echo ""
echo -e "${BOLD}📁 FILE KONFIGURASI YANG PERLU DIPERHATIKAN:${NC}"
echo -e "   Backend : ${CYAN}nano ${INSTALL_DIR}/backend/.env${NC}"
echo -e "   WA GW   : ${CYAN}nano ${INSTALL_DIR}/integration/whatsapp/.env${NC}"
echo -e "   Discord : ${CYAN}nano ${INSTALL_DIR}/integration/.env${NC}  (opsional)"
echo ""
echo -e "${BOLD}🔍 PERINTAH MONITORING:${NC}"
echo -e "   journalctl -u menettech-api.service -f"
echo -e "   journalctl -u menettech-worker.service -f"
echo -e "   systemctl status menettech-api menettech-worker"
echo ""
echo -e "${BOLD}🔄 RESTART SEMUA LAYANAN:${NC}"
echo -e "   systemctl restart menettech-api menettech-worker"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}⚠  LANGKAH PERTAMA SETELAH INSTALASI:${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "   1. Buka  → ${CYAN}http://${SERVER_IP}${NC}"
echo -e "   2. Login → username: ${GREEN}admin${NC}  password: ${GREEN}(password yang Anda masukkan tadi)${NC}"
echo -e "   3. Ganti password di menu Profile"
echo -e "   4. Buka Settings → isi konfigurasi MikroTik, Discord"
echo ""
