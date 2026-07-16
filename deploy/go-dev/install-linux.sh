#!/usr/bin/env bash
################################################################################
# Menet-Tech Dashboard Go - Linux Production Installer
# 
# Penggunaan:
#   chmod +x install-linux.sh
#   sudo ./install-linux.sh
#
# Requirements:
#   - Ubuntu/Debian Linux
#   - sudo/root access
#   - Go >= 1.26
#   - Node.js >= 18
#   - Nginx (recommended)
#
# Menghasilkan:
#   - /opt/menettech-go/ directory structure
#   - systemd units untuk API dan worker
#   - SQLite database
#   - Frontend static assets
################################################################################

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/menettech-go"
SERVICE_USER="menettech"
SERVICE_GROUP="menettech"
GO_MIN_VERSION="1.26"
NODE_MIN_VERSION="18"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $*"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*"
}

################################################################################
# Validation Functions
################################################################################

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Script ini harus dijalankan sebagai root (gunakan: sudo ./install-linux.sh)"
        exit 1
    fi
}

check_os() {
    if ! grep -qi "ubuntu\|debian" /etc/os-release; then
        log_warn "OS ini mungkin tidak didukung sepenuhnya. Script dirancang untuk Ubuntu/Debian."
    fi
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 tidak ditemukan. Silakan install terlebih dahulu."
        return 1
    fi
}

verify_go_version() {
    local version
    version=$(go version | awk '{print $3}' | sed 's/go//')
    
    log_info "Verifikasi Go version: $version (minimum: $GO_MIN_VERSION)"
    
    if [[ $(printf '%s\n' "$GO_MIN_VERSION" "$version" | sort -V | head -n1) != "$GO_MIN_VERSION" ]]; then
        log_error "Go $GO_MIN_VERSION atau lebih tinggi diperlukan, ditemukan: $version"
        exit 1
    fi
    
    log_success "Go version OK: $version"
}

verify_node_version() {
    local version
    version=$(node -v | sed 's/v//')
    
    log_info "Verifikasi Node.js version: $version (minimum: $NODE_MIN_VERSION)"
    
    if [[ $(printf '%s\n' "$NODE_MIN_VERSION" "$version" | sort -V | head -n1) != "$NODE_MIN_VERSION" ]]; then
        log_error "Node.js $NODE_MIN_VERSION atau lebih tinggi diperlukan, ditemukan: $version"
        exit 1
    fi
    
    log_success "Node.js version OK: $version"
}

################################################################################
# Setup Functions
################################################################################

setup_user() {
    log_info "Setup service user: $SERVICE_USER"
    
    if ! id "$SERVICE_USER" &>/dev/null 2>&1; then
        useradd -r -s /bin/bash -d "$INSTALL_DIR" -m "$SERVICE_USER" || {
            log_error "Gagal membuat user $SERVICE_USER"
            return 1
        }
        log_success "User $SERVICE_USER dibuat"
    else
        log_warn "User $SERVICE_USER sudah ada"
    fi
}

create_directories() {
    log_info "Membuat directory structure di $INSTALL_DIR"
    
    mkdir -p "$INSTALL_DIR"/{backend,frontend-dist,whatsapp,storage/{uploads,backups}}
    
    # Set permissions
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
    chmod 755 "$INSTALL_DIR"
    chmod 700 "$INSTALL_DIR/storage"
    
    log_success "Directory structure dibuat"
}

################################################################################
# Build Functions
################################################################################

build_backend() {
    if [[ "${PRECOMPILED_MODE:-false}" = "true" ]]; then
        log_info "Menyalin pre-compiled binary backend ke $INSTALL_DIR/backend/..."
        cp "./backend/menettech-go" "${INSTALL_DIR}/backend/menettech-go"
        cp "./backend/menettech-go-discord" "${INSTALL_DIR}/backend/menettech-go-discord"
        chown -R "$SERVICE_USER:$SERVICE_GROUP" "${INSTALL_DIR}/backend"
        chmod 755 "${INSTALL_DIR}/backend/menettech-go" "${INSTALL_DIR}/backend/menettech-go-discord"
        log_success "Backend binaries terpasang"
        return 0
    fi

    log_info "Build backend Go binary..."
    
    local repo_dir
    repo_dir=$(pwd)
    
    if [[ ! -f "${repo_dir}/backend/go.mod" ]]; then
        log_error "Tidak menemukan backend/go.mod di ${repo_dir}"
        exit 1
    fi
    
    cd "${repo_dir}/backend"
    
    # Run tests
    log_info "Menjalankan backend tests..."
    if ! go test ./... -timeout 120s; then
        log_error "Backend tests gagal"
        exit 1
    fi
    
    # Build binary
    log_info "Compile backend..."
    if ! go build -o "${INSTALL_DIR}/backend/menettech-go" ./cmd/api; then
        log_error "Gagal compile backend"
        exit 1
    fi
    
    # Build Discord Bot binary
    log_info "Compile Discord Bot..."
    if ! go build -o "${INSTALL_DIR}/backend/menettech-go-discord" ./cmd/discord-bot; then
        log_error "Gagal compile Discord Bot"
        exit 1
    fi
    
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "${INSTALL_DIR}/backend"
    chmod 755 "${INSTALL_DIR}/backend/menettech-go" "${INSTALL_DIR}/backend/menettech-go-discord"
    
    log_success "Backend binary: ${INSTALL_DIR}/backend/menettech-go"
    log_success "Discord Bot binary: ${INSTALL_DIR}/backend/menettech-go-discord"
}

build_frontend() {
    if [[ "${PRECOMPILED_MODE:-false}" = "true" ]]; then
        log_info "Menyalin pre-built frontend dist ke $INSTALL_DIR/frontend-dist/..."
        rm -rf "${INSTALL_DIR}/frontend-dist/"*
        cp -r ./frontend-dist/* "${INSTALL_DIR}/frontend-dist/"
        chown -R "$SERVICE_USER:$SERVICE_GROUP" "${INSTALL_DIR}/frontend-dist"
        chmod -R 755 "${INSTALL_DIR}/frontend-dist"
        log_success "Frontend assets terpasang"
        return 0
    fi

    log_info "Build frontend React+TypeScript..."
    
    local repo_dir
    repo_dir=$(pwd)
    
    if [[ ! -f "${repo_dir}/frontend/package.json" ]]; then
        log_error "Tidak menemukan frontend/package.json di ${repo_dir}"
        exit 1
    fi
    
    cd "${repo_dir}/frontend"
    
    log_info "Install frontend dependencies..."
    npm ci
    
    log_info "Build frontend..."
    npm run build
    
    # Move dist to install dir
    log_info "Packing frontend dist..."
    rm -rf "${INSTALL_DIR}/frontend-dist/"*
    cp -r dist/* "${INSTALL_DIR}/frontend-dist/"
    
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "${INSTALL_DIR}/frontend-dist"
    chmod -R 755 "${INSTALL_DIR}/frontend-dist"
    
    log_success "Frontend dist: ${INSTALL_DIR}/frontend-dist/"
}

deploy_whatsapp() {
    if [[ -d "./whatsapp" ]]; then
        log_info "Menyalin WhatsApp Gateway source code..."
        
        # Backup WhatsApp storage (session tokens) agar tidak ter-logout saat update
        if [[ -d "${INSTALL_DIR}/whatsapp/storage" ]]; then
            log_info "Mencadangkan sesi WhatsApp..."
            cp -r "${INSTALL_DIR}/whatsapp/storage" "/tmp/whatsapp_storage_backup"
        fi

        # Perhatikan agar .env tidak terhapus jika ada di dalam folder whatsapp, 
        # walau best practice-nya .env ada di backend.
        if [[ -f "${INSTALL_DIR}/whatsapp/.env" ]]; then
            cp "${INSTALL_DIR}/whatsapp/.env" "/tmp/whatsapp_env_backup"
        fi

        rm -rf "${INSTALL_DIR}/whatsapp/"*
        cp -r ./whatsapp/* "${INSTALL_DIR}/whatsapp/"
        
        # Restore WhatsApp storage
        if [[ -d "/tmp/whatsapp_storage_backup" ]]; then
            log_info "Mengembalikan sesi WhatsApp..."
            cp -r "/tmp/whatsapp_storage_backup" "${INSTALL_DIR}/whatsapp/storage"
            rm -rf "/tmp/whatsapp_storage_backup"
        fi
        
        if [[ -f "/tmp/whatsapp_env_backup" ]]; then
            cp "/tmp/whatsapp_env_backup" "${INSTALL_DIR}/whatsapp/.env"
            rm -f "/tmp/whatsapp_env_backup"
        fi
        
        # JALANKAN npm install di server jika Node.js tersedia
        if command -v npm &> /dev/null; then
            log_info "Menginstall WhatsApp gateway dependencies di server..."
            (
                cd "${INSTALL_DIR}/whatsapp"
                npm ci --production || npm install --production
            )
        else
            log_warn "Node.js/npm tidak ditemukan. Lewati install npm dependencies untuk WhatsApp."
            log_warn "Silakan jalankan 'npm install --production' secara manual di '${INSTALL_DIR}/whatsapp' setelah menginstall Node.js."
        fi
        
        chown -R "$SERVICE_USER:$SERVICE_GROUP" "${INSTALL_DIR}/whatsapp"
        chmod -R 755 "${INSTALL_DIR}/whatsapp"
        log_success "WhatsApp Gateway terpasang di ${INSTALL_DIR}/whatsapp/"
    fi
}

################################################################################
# Configuration Functions
################################################################################

setup_env_file() {
    log_info "Setup .env file..."
    
    local env_file="${INSTALL_DIR}/backend/.env"
    
    if [[ -f "$env_file" ]]; then
        log_warn ".env sudah ada, skip setup. Edit manual di: $env_file"
        return 0
    fi
    
    cat > "$env_file" << 'EOF'
APP_NAME="Menet-Tech Dashboard Go"
APP_ENV=production
# Ganti HTTP_ADDR ke :8080 atau :80 (tanpa 127.0.0.1) jika tidak menggunakan Nginx
HTTP_ADDR=127.0.0.1:8080
SQLITE_PATH=/opt/menettech-go/storage/dashboard.db
STORAGE_PATH=/opt/menettech-go/storage
FRONTEND_DIST_PATH=/opt/menettech-go/frontend-dist
SESSION_COOKIE_NAME=menettech_session
SESSION_COOKIE_SECURE=true
SESSION_TTL_HOURS=24
LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_MINUTES=15
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=change-me-now
MIKROTIK_HOST=
MIKROTIK_USER=
MIKROTIK_PASS=
MIKROTIK_TEST_USERNAME=test-user

# Discord Bot Gateway Settings
DISCORD_BOT_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=
API_BASE_URL=http://127.0.0.1:8080
EOF
    
    chown "$SERVICE_USER:$SERVICE_GROUP" "$env_file"
    chmod 600 "$env_file"
    
    log_warn ".env file sudah dibuat dengan default password. WAJIB ganti di production!"
    log_warn "Lokasi: $env_file"
}

################################################################################
# Systemd Setup Functions
################################################################################

find_service_template() {
    local name="$1"
    local paths=(
        "./deploy/go-dev/${name}"
        "./deploy/${name}"
        "./${name}"
        "/tmp/${name}"
    )
    for p in "${paths[@]}"; do
        if [[ -f "$p" ]]; then
            echo "$p"
            return 0
        fi
    done
    return 1
}

setup_systemd_api() {
    log_info "Setup systemd unit: menettech-go-api.service"
    
    local service_file="/etc/systemd/system/menettech-go-api.service"
    local template_path
    template_path=$(find_service_template "menettech-go-api.service") || {
        log_error "Template service file menettech-go-api.service tidak ditemukan"
        return 1
    }
    
    # Copy dan adjust path
    cp "$template_path" "$service_file"
    
    # Replace placeholder paths
    sed -i "s|/opt/menettech-go|$INSTALL_DIR|g" "$service_file"
    sed -i "s|User=menettech|User=$SERVICE_USER|g" "$service_file"
    sed -i "s|Group=menettech|Group=$SERVICE_GROUP|g" "$service_file"
    
    chmod 644 "$service_file"
    
    systemctl daemon-reload
    systemctl enable "menettech-go-api.service"
    
    log_success "Systemd service menettech-go-api.service installed"
}

setup_systemd_worker() {
    log_info "Setup systemd unit: menettech-go-worker.service"
    
    local service_file="/etc/systemd/system/menettech-go-worker.service"
    local template_path
    template_path=$(find_service_template "menettech-go-worker.service") || {
        log_error "Template service file menettech-go-worker.service tidak ditemukan"
        return 1
    }
    
    # Copy dan adjust path
    cp "$template_path" "$service_file"
    
    # Replace placeholder paths
    sed -i "s|/opt/menettech-go|$INSTALL_DIR|g" "$service_file"
    sed -i "s|User=menettech|User=$SERVICE_USER|g" "$service_file"
    sed -i "s|Group=menettech|Group=$SERVICE_GROUP|g" "$service_file"
    
    chmod 644 "$service_file"
    
    systemctl daemon-reload
    systemctl enable "menettech-go-worker.service"
    
    log_success "Systemd service menettech-go-worker.service installed"
}

setup_systemd_discord() {
    log_info "Setup systemd unit: menettech-go-discord.service"
    
    local service_file="/etc/systemd/system/menettech-go-discord.service"
    local template_path
    template_path=$(find_service_template "menettech-go-discord.service") || {
        log_error "Template service file untuk Discord bot tidak ditemukan"
        return 1
    }
    
    # Copy dan adjust path
    cp "$template_path" "$service_file"
    
    # Replace placeholder paths
    sed -i "s|/opt/menettech-go|$INSTALL_DIR|g" "$service_file"
    sed -i "s|User=menettech|User=$SERVICE_USER|g" "$service_file"
    sed -i "s|Group=menettech|Group=$SERVICE_GROUP|g" "$service_file"
    
    chmod 644 "$service_file"
    
    systemctl daemon-reload
    systemctl enable "menettech-go-discord.service"
    
    log_success "Systemd service menettech-go-discord.service installed"
}

setup_systemd_whatsapp() {
    if [[ ! -d "${INSTALL_DIR}/whatsapp" ]]; then
        return 0
    fi
    
    log_info "Setup systemd unit: menettech-go-whatsapp.service"
    
    local service_file="/etc/systemd/system/menettech-go-whatsapp.service"
    local template_path
    template_path=$(find_service_template "menettech-go-whatsapp.service") || {
        log_warn "Template service file menettech-go-whatsapp.service tidak ditemukan, melewatinya."
        return 0
    }
    
    # Copy dan adjust path
    cp "$template_path" "$service_file"
    
    # Replace placeholder paths
    sed -i "s|/opt/menettech-go|$INSTALL_DIR|g" "$service_file"
    sed -i "s|User=menettech|User=$SERVICE_USER|g" "$service_file"
    sed -i "s|Group=menettech|Group=$SERVICE_GROUP|g" "$service_file"
    
    # Deteksi lokasi node binary
    local node_path
    node_path=$(command -v node || echo "/usr/bin/node")
    sed -i "s|/usr/bin/node|$node_path|g" "$service_file"
    
    chmod 644 "$service_file"
    
    systemctl daemon-reload
    systemctl enable "menettech-go-whatsapp.service"
    
    log_success "Systemd service menettech-go-whatsapp.service installed"
}

################################################################################
# Verification Functions
################################################################################

verify_installation() {
    log_info "Verifikasi instalasi..."
    
    local checks_passed=0
    local total_checks=0
    
    # Check binary
    total_checks=$((total_checks + 1))
    if [[ -x "${INSTALL_DIR}/backend/menettech-go" ]]; then
        log_success "Binary backend tersedia"
        checks_passed=$((checks_passed + 1))
    else
        log_error "Binary backend tidak ditemukan atau tidak executable"
    fi
    
    # Check discord-bot binary
    total_checks=$((total_checks + 1))
    if [[ -x "${INSTALL_DIR}/backend/menettech-go-discord" ]]; then
        log_success "Binary Discord bot tersedia"
        checks_passed=$((checks_passed + 1))
    else
        log_error "Binary Discord bot tidak ditemukan atau tidak executable"
    fi
    
    # Check frontend
    total_checks=$((total_checks + 1))
    if [[ -d "${INSTALL_DIR}/frontend-dist" ]] && [[ -n "$(ls -A ${INSTALL_DIR}/frontend-dist)" ]]; then
        log_success "Frontend dist tersedia"
        checks_passed=$((checks_passed + 1))
    else
        log_error "Frontend dist tidak ditemukan atau kosong"
    fi
    
    # Check .env
    total_checks=$((total_checks + 1))
    if [[ -f "${INSTALL_DIR}/backend/.env" ]]; then
        log_success ".env file tersedia"
        checks_passed=$((checks_passed + 1))
    else
        log_error ".env file tidak ditemukan"
    fi
    
    # Check directories
    total_checks=$((total_checks + 1))
    if [[ -d "${INSTALL_DIR}/storage" ]]; then
        log_success "Storage directory tersedia"
        checks_passed=$((checks_passed + 1))
    else
        log_error "Storage directory tidak ditemukan"
    fi
    
    # Check systemd API
    total_checks=$((total_checks + 1))
    if systemctl list-unit-files | grep -q "menettech-go-api.service"; then
        log_success "Systemd menettech-go-api.service registered"
        checks_passed=$((checks_passed + 1))
    else
        log_error "Systemd menettech-go-api.service tidak registered"
    fi

    # Check systemd Discord Bot
    total_checks=$((total_checks + 1))
    if systemctl list-unit-files | grep -q "menettech-go-discord.service"; then
        log_success "Systemd menettech-go-discord.service registered"
        checks_passed=$((checks_passed + 1))
    else
        log_error "Systemd menettech-go-discord.service tidak registered"
    fi

    # Check systemd WhatsApp Gateway (jika terinstall)
    if [[ -d "${INSTALL_DIR}/whatsapp" ]]; then
        total_checks=$((total_checks + 1))
        if systemctl list-unit-files | grep -q "menettech-go-whatsapp.service"; then
            log_success "Systemd menettech-go-whatsapp.service registered"
            checks_passed=$((checks_passed + 1))
        else
            log_error "Systemd menettech-go-whatsapp.service tidak registered"
        fi
    fi
    
    echo ""
    log_info "Verifikasi selesai: $checks_passed/$total_checks checks passed"
    
    if [[ $checks_passed -eq $total_checks ]]; then
        return 0
    else
        return 1
    fi
}

################################################################################
# Post-Install Instructions
################################################################################

print_post_install() {
    cat << 'EOF'

╔════════════════════════════════════════════════════════════════════════════╗
║                  INSTALASI BERHASIL SELESAI ✓                              ║
╚════════════════════════════════════════════════════════════════════════════╝

📁 Direktori instalasi: /opt/menettech-go/

📋 LANGKAH SELANJUTNYA:

1. ⚙️  KONFIGURASI ENVIRONMENT
   Edit file: /opt/menettech-go/backend/.env
   
   Minimal yang WAJIB diubah:
   - BOOTSTRAP_ADMIN_PASSWORD (ganti dari: change-me-now)
   - HTTP_ADDR (untuk production: 0.0.0.0:8080)
   - SESSION_COOKIE_SECURE (untuk production: true)
   - DATABASE & NOTIFICATION settings (jika diperlukan)
   - DISCORD_BOT_TOKEN & DISCORD_APPLICATION_ID (jika menggunakan integrasi Discord)

   Contoh:
   $ sudo nano /opt/menettech-go/backend/.env

2. 🚀 START SERVICES
   Jalankan API server:
   $ sudo systemctl start menettech-go-api
   
   Jalankan background worker:
   $ sudo systemctl start menettech-go-worker

   Jalankan Discord Bot:
   $ sudo systemctl start menettech-go-discord
   
   Cek status:
   $ sudo systemctl status menettech-go-api
   $ sudo systemctl status menettech-go-worker
   $ sudo systemctl status menettech-go-discord
   
   Lihat logs:
   $ sudo journalctl -u menettech-go-api -f
   $ sudo journalctl -u menettech-go-worker -f
   $ sudo journalctl -u menettech-go-discord -f

3. 🌐 SETUP NGINX (Optional - untuk production)
   Contoh konfigurasi Nginx:
   
   upstream menettech_backend {
       server 127.0.0.1:8080;
   }
   
   server {
       listen 80;
       server_name dashboard.example.com;
       client_max_body_size 50M;
       
       # API endpoints
       location /api/ {
           proxy_pass http://menettech_backend;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
       
       # Health checks
       location /livez {
           proxy_pass http://menettech_backend;
       }
       location /readyz {
           proxy_pass http://menettech_backend;
       }
       
       # Static assets (frontend)
       location / {
           root /opt/menettech-go/frontend-dist;
           try_files $uri $uri/ /index.html;
       }
   }

4. 🔍 VERIFY INSTALLATION
   Test health endpoint:
   $ curl http://127.0.0.1:8080/livez
   $ curl http://127.0.0.1:8080/readyz
   
   Login dengan kredensial:
   - Username: admin
   - Password: (sesuai BOOTSTRAP_ADMIN_PASSWORD di .env)
   
   Web interface: http://127.0.0.1:8080/

5. 📚 DOKUMENTASI LANJUTAN
   Baca file:
   - /opt/menettech-go/../docs/go-dev/PRODUCTION.md
   - /opt/menettech-go/../docs/go-dev/BLUEPRINT.md

📝 TROUBLESHOOTING:

Jika service gagal start:
$ sudo systemctl start menettech-go-api
$ sudo journalctl -u menettech-go-api -n 50 -e

Jika database error (first run):
Migrations akan otomatis berjalan saat startup pertama.

Untuk debugging lebih lanjut:
$ sudo -u menettech /opt/menettech-go/backend/menettech-go api --help
$ sudo -u menettech /opt/menettech-go/backend/menettech-go-discord

EOF
}

################################################################################
# Main Execution
################################################################################

main() {
    log_info "==============================================="
    log_info "Menet-Tech Dashboard Go - Linux Installer"
    log_info "==============================================="
    
    # Pre-installation checks
    log_info ""
    log_info "1️⃣  Melakukan pre-installation checks..."
    
    check_root
    check_os
    
    # Deteksi Precompiled Mode
    PRECOMPILED_MODE=false
    if [[ -f "./backend/menettech-go" ]] && [[ -f "./backend/menettech-go-discord" ]] && [[ -d "./frontend-dist" ]]; then
        PRECOMPILED_MODE=true
        log_success "Mendeteksi paket RILIS PRE-COMPILED (Go & Node.js compiler tidak wajib di-install di server!)"
    fi

    if [[ "$PRECOMPILED_MODE" = "false" ]]; then
        if ! check_command "go"; then
            log_error "Go belum terinstall. Install dari: https://golang.org/dl"
            exit 1
        fi
        verify_go_version
        
        if ! check_command "node"; then
            log_error "Node.js belum terinstall. Install dari: https://nodejs.org"
            exit 1
        fi
        verify_node_version
        
        if ! check_command "npm"; then
            log_error "npm belum terinstall (biasanya bundled dengan Node.js)"
            exit 1
        fi
    else
        log_info "Skip pencarian compiler Go dan Node.js karena menggunakan pre-compiled mode."
        # Namun jika ada whatsapp folder, Node.js tetap direkomendasikan jika ingin mengaktifkan WA
        if [[ -d "./whatsapp" ]]; then
            if ! command -v node &>/dev/null; then
                log_warn "WhatsApp Gateway terdeteksi, tetapi Node.js tidak ditemukan. Anda tidak akan bisa menjalankan WA Gateway di server ini sebelum menginstall Node.js."
            fi
        fi
    fi
    
    # Setup
    log_info ""
    log_info "2️⃣  Melakukan setup..."
    setup_user
    create_directories
    
    # Build
    log_info ""
    log_info "3️⃣  Building/Deploying aplikasi..."
    build_backend
    build_frontend
    deploy_whatsapp
    
    # Configure
    log_info ""
    log_info "4️⃣  Konfigurasi environment..."
    setup_env_file
    
    # Systemd
    log_info ""
    log_info "5️⃣  Setup systemd services..."
    setup_systemd_api
    setup_systemd_worker
    setup_systemd_discord
    setup_systemd_whatsapp
    
    # Verify
    log_info ""
    log_info "6️⃣  Verifikasi instalasi..."
    if verify_installation; then
        log_success "Semua komponen terverifikasi!"
    else
        log_warn "Beberapa komponen tidak terverifikasi. Cek output di atas."
    fi
    
    # Post-install info
    echo ""
    print_post_install
}

# Run main function
main "$@"
