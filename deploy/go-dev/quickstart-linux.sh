#!/usr/bin/env bash
################################################################################
# Menet-Tech Dashboard Go - Linux Quick Start
#
# Penggunaan:
#   chmod +x quickstart-linux.sh
#   ./quickstart-linux.sh
#
# Tujuan:
#   Menjalankan development environment dengan setup minimal
#   - Backend API
#   - Frontend dev server
#   - Watch untuk tests
#
# Requirements:
#   - Go >= 1.26
#   - Node.js >= 18
#   - npm/yarn
#
# Format:
#   ./quickstart-linux.sh [command]
#
# Commands:
#   (none/default)  - Start semua services
#   api             - Backend API saja
#   worker          - Worker saja
#   frontend        - Frontend dev saja
#   test            - Run tests saja
#   setup-env       - Setup .env file only
#   clean           - Bersihkan temp files & caches
#   help            - Show help
################################################################################

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
ENV_FILE="${BACKEND_DIR}/.env"
DB_PATH="${ROOT_DIR}/storage/dashboard.db"

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

log_header() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} $1"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Utility functions
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 tidak ditemukan"
        return 1
    fi
    return 0
}

setup_env_file() {
    if [[ -f "$ENV_FILE" ]]; then
        log_warn ".env sudah ada di $ENV_FILE"
        return 0
    fi
    
    log_info "Membuat .env file..."
    
    mkdir -p "$(dirname "$ENV_FILE")"
    
    cat > "$ENV_FILE" << 'EOF'
APP_NAME="Menet-Tech Dashboard Go"
APP_ENV=development
HTTP_ADDR=127.0.0.1:8080
SQLITE_PATH=./storage/dashboard.db
STORAGE_PATH=./storage
SESSION_COOKIE_NAME=menettech_session
SESSION_COOKIE_SECURE=false
SESSION_TTL_HOURS=24
LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_MINUTES=15
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=admin123
MIKROTIK_HOST=
MIKROTIK_USER=
MIKROTIK_PASS=
MIKROTIK_TEST_USERNAME=test-user
EOF
    
    log_success ".env file created: $ENV_FILE"
    log_warn "Default password: admin123 (ubah jika perlu)"
}

# ===================================================================
# Commands
# ===================================================================

cmd_start_all() {
    log_header "🚀 Starting All Services (press Ctrl+C to stop)"
    
    # Check if we have tmux (better UX) or fallback to basic setup
    if command -v tmux &> /dev/null; then
        cmd_start_all_tmux
    else
        cmd_start_all_simple
    fi
}

cmd_start_all_tmux() {
    log_info "Menggunakan tmux untuk multi-window..."
    
    local session_name="menettech-dev"
    
    # Kill existing session jika ada
    tmux kill-session -t "$session_name" 2>/dev/null || true
    
    # Create session
    tmux new-session -d -s "$session_name" -x 250 -y 50
    
    # Window 1: Backend API
    tmux new-window -t "$session_name" -n "backend"
    tmux send-keys -t "$session_name:backend" "cd '$BACKEND_DIR' && echo '📦 Starting Backend API...' && go run ./cmd/api api" Enter
    
    # Window 2: Frontend dev
    tmux new-window -t "$session_name" -n "frontend"
    tmux send-keys -t "$session_name:frontend" "cd '$FRONTEND_DIR' && echo '🌐 Starting Frontend Dev Server...' && npm run dev" Enter
    
    # Window 3: Tests (watch mode)
    tmux new-window -t "$session_name" -n "test"
    tmux send-keys -t "$session_name:test" "cd '$BACKEND_DIR' && echo '🧪 Running Tests in Watch Mode...' && go test -v -run . ./... -timeout 10s | grep -E '(PASS|FAIL|---)'  || true" Enter
    
    # Window 4: Logs/Info
    tmux new-window -t "$session_name" -n "info"
    tmux send-keys -t "$session_name:info" "clear && cat << 'EOFINFO'
╔════════════════════════════════════════════════════════════════╗
║            🎯 Development Environment Started                  ║
╚════════════════════════════════════════════════════════════════╝

📊 Windows:
  - backend   : Backend API (http://localhost:8080)
  - frontend  : Frontend Dev (http://localhost:5173)
  - test      : Tests watch mode
  - info      : This window

🌐 Access:
  Backend API : http://localhost:8080
  Frontend    : http://localhost:5173
  Database    : ./storage/dashboard.db (SQLite)

🔑 Credentials:
  Username: admin
  Password: admin123

📝 Management:
  Switch window : Ctrl+B then number (1-5) or arrow
  Kill window   : Ctrl+B then X
  Kill session  : tmux kill-session -t $session_name
  Reattach      : tmux attach -t $session_name

📚 Shortcuts:
  Ctrl+C     : Stop current service
  Ctrl+B D   : Detach from tmux (app keeps running)
  Ctrl+B [   : Scroll/view output

🚀 Next Steps:
  1. Open browser to http://localhost:8080
  2. Login dengan admin / admin123
  3. Setup integrasi di Settings jika diperlukan
  4. Edit .env untuk konfigurasi lebih lanjut

EOFINFO
" Enter
    
    # Attach to session
    log_success "Tmux session '$session_name' created!"
    log_info "Menghubungkan ke tmux session..."
    sleep 2
    tmux attach-session -t "$session_name"
}

cmd_start_all_simple() {
    log_warn "tmux tidak ditemukan. Running services secara sequential..."
    log_warn "Silakan buka terminal baru untuk menjalankan services lain."
    
    echo ""
    echo "Untuk setup development optimal, lakukan di terminal terpisah:"
    echo ""
    echo "Terminal 1 - Backend API:"
    echo "  cd $BACKEND_DIR"
    echo "  go run ./cmd/api api"
    echo ""
    echo "Terminal 2 - Frontend Dev:"
    echo "  cd $FRONTEND_DIR"
    echo "  npm run dev"
    echo ""
    echo "Terminal 3 - Tests:"
    echo "  cd $BACKEND_DIR"
    echo "  go test ./... -v"
    echo ""
    
    # Start backend in background
    log_info "Starting backend API..."
    cd "$BACKEND_DIR"
    go run ./cmd/api api
}

cmd_start_api() {
    log_header "🚀 Backend API"
    log_info "Starting backend API server on http://localhost:8080..."
    log_warn "Press Ctrl+C to stop"
    
    cd "$BACKEND_DIR"
    
    # Create storage dir if needed
    mkdir -p storage
    
    # Show info
    echo ""
    log_info "Endpoints:"
    log_info "  Health    : GET http://localhost:8080/livez"
    log_info "  Meta      : GET http://localhost:8080/api/v1/meta"
    log_info "  Login     : POST http://localhost:8080/api/v1/auth/login"
    log_info "  Dashboard : http://localhost:8080/"
    echo ""
    
    exec go run ./cmd/api api
}

cmd_start_worker() {
    log_header "⚙️  Background Worker"
    log_info "Starting background worker..."
    log_warn "Press Ctrl+C to stop"
    
    cd "$BACKEND_DIR"
    exec go run ./cmd/api worker
}

cmd_start_frontend() {
    log_header "🌐 Frontend Dev Server"
    log_info "Starting Vite dev server on http://localhost:5173..."
    log_warn "Press Ctrl+C to stop"
    
    cd "$FRONTEND_DIR"
    
    # Install deps if needed
    if [[ ! -d "node_modules" ]]; then
        log_info "Installing dependencies..."
        npm install
    fi
    
    exec npm run dev
}

cmd_run_tests() {
    log_header "🧪 Running Tests"
    
    cd "$BACKEND_DIR"
    
    log_info "Menjalankan backend tests..."
    echo ""
    
    go test ./... -v -timeout 30s
    
    echo ""
    log_success "Tests selesai"
}

cmd_watch_tests() {
    log_header "👁️  Watch Mode Tests"
    log_info "Running tests in watch mode..."
    log_info "Tests akan dijalankan ulang saat file berubah"
    log_info "Press Ctrl+C to stop"
    echo ""
    
    cd "$BACKEND_DIR"
    
    # Try to use fswatch if available, else run once
    if command -v fswatch &> /dev/null; then
        log_info "Menggunakan fswatch untuk watch mode..."
        fswatch -r . | while read -r; do
            clear
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "Running tests... $(date '+%H:%M:%S')"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            go test ./... -timeout 10s -v 2>&1 | tail -30
        done
    else
        log_info "fswatch tidak ditemukan, menjalankan tests once..."
        go test ./... -v -timeout 30s
    fi
}

cmd_check() {
    log_header "🔍 Health Check"
    
    log_info "Checking prerequisites..."
    
    local all_ok=true
    
    # Check Go
    if check_command "go"; then
        local go_ver=$(go version | awk '{print $3}')
        log_success "Go $go_ver"
    else
        log_error "Go tidak ditemukan"
        all_ok=false
    fi
    
    # Check Node
    if check_command "node"; then
        local node_ver=$(node -v)
        log_success "Node.js $node_ver"
    else
        log_error "Node.js tidak ditemukan"
        all_ok=false
    fi
    
    # Check npm
    if check_command "npm"; then
        local npm_ver=$(npm -v)
        log_success "npm $npm_ver"
    else
        log_error "npm tidak ditemukan"
        all_ok=false
    fi
    
    # Check dirs
    if [[ -d "$BACKEND_DIR" ]]; then
        log_success "Backend directory found"
    else
        log_error "Backend directory not found: $BACKEND_DIR"
        all_ok=false
    fi
    
    if [[ -d "$FRONTEND_DIR" ]]; then
        log_success "Frontend directory found"
    else
        log_error "Frontend directory not found: $FRONTEND_DIR"
        all_ok=false
    fi
    
    # Check .env
    if [[ -f "$ENV_FILE" ]]; then
        log_success ".env file found"
    else
        log_warn ".env file not found (will be created on first run)"
    fi
    
    echo ""
    if [[ "$all_ok" == true ]]; then
        log_success "Semua prerequisites terpenuhi! ✓"
        return 0
    else
        log_error "Beberapa prerequisites tidak terpenuhi"
        return 1
    fi
}

cmd_clean() {
    log_header "🧹 Cleaning Temporary Files"
    
    log_info "Cleaning backend..."
    cd "$BACKEND_DIR"
    
    rm -rf build dist bin *.exe *.so *.dylib 2>/dev/null || true
    go clean -cache -testcache 2>/dev/null || true
    
    log_success "Backend cleaned"
    
    log_info "Cleaning frontend..."
    cd "$FRONTEND_DIR"
    
    rm -rf dist build node_modules/.vite 2>/dev/null || true
    
    log_success "Frontend cleaned"
    
    log_success "Cleanup complete!"
}

cmd_reset() {
    log_header "🔄 Reset Development Environment"
    
    log_warn "Ini akan:"
    log_warn "  - Delete SQLite database"
    log_warn "  - Clean cache"
    log_warn "  - Reset ke state awal"
    echo ""
    
    read -p "Lanjutkan? (y/N): " -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Dibatalkan"
        return 1
    fi
    
    log_info "Removing database..."
    rm -f "$DB_PATH" 2>/dev/null || true
    
    cmd_clean
    
    log_success "Environment reset complete!"
    log_info "Jalankan quickstart lagi untuk menginit database"
}

cmd_help() {
    cat << 'EOF'

╔═══════════════════════════════════════════════════════════════╗
║  Menet-Tech Dashboard Go - Linux Quick Start Helper          ║
╚═══════════════════════════════════════════════════════════════╝

PENGGUNAAN:
  ./quickstart-linux.sh [command]

COMMANDS:

  (no args)     Mulai semua services (backend + frontend + info)
                Memerlukan tmux untuk experience terbaik

  api           Start backend API saja
  worker        Start background worker saja
  frontend      Start frontend dev server saja
  test          Run backend tests once
  watch         Run backend tests in watch mode
  check         Verify prerequisites
  setup-env     Setup .env file
  clean         Bersihkan temp files & caches
  reset         Reset database & environment
  help          Show help message (ini)

EXAMPLES:

  # Start semua (recommended untuk development)
  ./quickstart-linux.sh

  # Backend only
  ./quickstart-linux.sh api

  # Frontend only
  ./quickstart-linux.sh frontend

  # Run tests
  ./quickstart-linux.sh test

  # Watch tests (auto-rerun saat file berubah)
  ./quickstart-linux.sh watch

  # Setup .env
  ./quickstart-linux.sh setup-env

REQUIREMENTS:

  - Go >= 1.26    (https://golang.org/dl)
  - Node.js >= 18 (https://nodejs.org)
  - tmux (optional, untuk multi-window support)

WORKFLOW TYPICAL:

  1. Clone repository
     git clone <repo-url>
     cd Dashboard

  2. Run quickstart
     chmod +x deploy/go-dev/quickstart-linux.sh
     ./deploy/go-dev/quickstart-linux.sh

  3. Open browser
     http://localhost:8080
     
  4. Login dengan credentials default:
     Username: admin
     Password: admin123

TROUBLESHOOTING:

  "Command not found" errors:
    → Install Go & Node.js
    → Check PATH environment variable

  "Port 8080 already in use":
    → Edit backend/.env dan ubah HTTP_ADDR
    → Atau kill process yang menggunakan port tersebut

  Tests failing:
    → Run: ./quickstart-linux.sh test
    → Check output untuk error details

  Database errors:
    → Run: ./quickstart-linux.sh reset
    → Database akan diinit ulang

FILES:

  Repository root: $ROOT_DIR
  Backend:        $BACKEND_DIR
  Frontend:       $FRONTEND_DIR
  Config file:    $ENV_FILE

DOCUMENTATION:

  - Backend README:     ./backend/README.md
  - Frontend README:    ./frontend/README.md
  - Blueprint:         ./docs/go-dev/BLUEPRINT.md
  - Architecture:      ./docs/go-dev/ARCHITECTURE.md

SUPPORT:

  Jika ada issues, check:
    1. Dokumentasi di ./docs/go-dev/
    2. Backend logs: journalctl atau output terminal
    3. Frontend console: Browser DevTools (F12)

EOF
}

# ===================================================================
# Main
# ===================================================================

main() {
    local command="${1:-default}"
    
    # Create storage dir
    mkdir -p storage
    
    # Setup env if not exists
    if [[ ! -f "$ENV_FILE" ]]; then
        setup_env_file
        echo ""
    fi
    
    # Check prerequisites
    for cmd in go node npm; do
        if ! check_command "$cmd"; then
            log_error "$cmd tidak ditemukan. Install dari https://golang.org/dl dan https://nodejs.org"
            exit 1
        fi
    done
    
    case "$command" in
        api|backend)
            cmd_start_api
            ;;
        worker)
            cmd_start_worker
            ;;
        frontend)
            cmd_start_frontend
            ;;
        test)
            cmd_run_tests
            ;;
        watch)
            cmd_watch_tests
            ;;
        check)
            cmd_check
            ;;
        setup-env)
            setup_env_file
            ;;
        clean)
            cmd_clean
            ;;
        reset)
            cmd_reset
            ;;
        help|--help|-h)
            cmd_help
            ;;
        default)
            cmd_start_all
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
