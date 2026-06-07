# ===============================================================================
# Menet-Tech Dashboard Go - Windows Quick Start
#
# Penggunaan:
#   1. Buka PowerShell
#   2. cd ke root repository
#   3. .\deploy\go-dev\quickstart-windows.ps1 [command]
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
#   - Windows 10/11
#
# Commands:
#   (none/default) - Start semua services (recommended dengan tmux)
#   api            - Backend API saja
#   worker         - Worker saja
#   frontend       - Frontend dev saja
#   test           - Run tests once
#   watch          - Run tests in watch mode
#   check          - Verify prerequisites
#   setup-env      - Initialize .env file only
#   clean          - Bersihkan temp files & caches
#   reset          - Full reset: DB, WA sessions, .env, cache (bersih total)
#   help           - Show help
# ===============================================================================

param(
    [Parameter(Position = 0)]
    [ValidateSet("api", "worker", "frontend", "whatsapp", "test", "watch", "check", "setup-env", "clean", "reset", "help", $null)]
    [string]$Command = "",

    [Parameter(Position = 1)]
    [switch]$Force
)

# Handle null/empty command
if ($null -eq $Command) {
    $Command = ""
}

$ErrorActionPreference = "Stop"

# ===============================================================================
# Configuration
# ===============================================================================

$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$backendPath = Join-Path -Path $repoRoot -ChildPath "backend"
$frontendPath = Join-Path -Path $repoRoot -ChildPath "frontend"
$storagePath = Join-Path -Path $repoRoot -ChildPath "storage"
$whatsappPath = Join-Path -Path $repoRoot -ChildPath "whatsapp"

$script:Config = @{
    RepoRoot      = $repoRoot
    BackendDir    = $backendPath
    FrontendDir   = $frontendPath
    WhatsAppDir   = $whatsappPath
    EnvFile       = "$backendPath\.env"
    DbPath        = "$storagePath\dashboard.db"
    StorageDir    = $storagePath
}

# Colors
$script:Colors = @{
    Info    = "Cyan"
    Success = "Green"
    Warning = "Yellow"
    Error   = "Red"
    Header  = "Cyan"
}

# ===============================================================================
# Logging Functions
# ===============================================================================

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("Info", "Success", "Warning", "Error")]
        [string]$Type = "Info"
    )
    
    $color = $script:Colors[$Type]
    $prefix = @{
        Info    = "[INFO]"
        Success = "[OK]"
        Warning = "[!]"
        Error   = "[X]"
    }[$Type]
    
    Write-Host "$prefix $Message" -ForegroundColor $color
}

function Write-Header {
    param([string]$Title)
    
    Write-Host ""
    Write-Host "=======================================================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "=======================================================================" -ForegroundColor Cyan
    Write-Host ""
}

# ===============================================================================
# Utility Functions
# ===============================================================================

function Test-CommandExists {
    param([string]$Command)
    
    try {
        $null = Get-Command $Command -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Initialize-EnvFile {
    if (Test-Path $script:Config.EnvFile) {
        Write-Log ".env sudah ada di $($script:Config.EnvFile)" -Type Warning
        return
    }
    
    Write-Log "Membuat .env file..."
    
    $envContent = @"
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

# WhatsApp Gateway
# Set ENABLE_WHATSAPP=true untuk menjalankan WA gateway secara otomatis
ENABLE_WHATSAPP=false
WA_GATEWAY_PORT=3001
# URL Go backend yang diakses oleh gateway
DASHBOARD_API_URL=http://localhost:8080
# API key internal: harus sama dengan nilai 'wa_api_key' di tabel pengaturan
DASHBOARD_INTERNAL_API_KEY=change-me-secret
"@
    
    $null = New-Item -ItemType File -Path $script:Config.EnvFile -Force
    Set-Content -Path $script:Config.EnvFile -Value $envContent -Encoding UTF8
    
    Write-Log ".env file created: $($script:Config.EnvFile)" -Type Success
    Write-Log "Default password: admin123 (ubah jika perlu)" -Type Warning
}
Set-Alias -Name Setup-EnvFile -Value Initialize-EnvFile

function Import-EnvFile {
    if (-not (Test-Path $script:Config.EnvFile)) { return }
    Get-Content $script:Config.EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split '=', 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $val = $parts[1].Trim().Trim('"').Trim("'")
                [System.Environment]::SetEnvironmentVariable($key, $val, [System.EnvironmentVariableTarget]::Process)
            }
        }
    }
}

function Test-Prerequisites {
    Write-Header "Checking Prerequisites"
    
    Write-Log "PowerShell version: $($PSVersionTable.PSVersion)" -Type Success
    
    # Check Go
    if (-not (Test-CommandExists "go")) {
        Write-Log "Go tidak ditemukan! Download dari: https://golang.org/dl" -Type Error
        return $false
    }
    Write-Log "Go OK" -Type Success
    
    # Check Node
    if (-not (Test-CommandExists "node")) {
        Write-Log "Node.js tidak ditemukan! Download dari: https://nodejs.org" -Type Error
        return $false
    }
    Write-Log "Node.js OK" -Type Success
    
    # Check npm
    if (-not (Test-CommandExists "npm")) {
        Write-Log "npm tidak ditemukan (biasanya bundled dengan Node.js)" -Type Error
        return $false
    }
    Write-Log "npm OK" -Type Success
    
    # Check dirs
    if (-not (Test-Path $script:Config.BackendDir)) {
        Write-Log "Backend directory tidak ditemukan: $($script:Config.BackendDir)" -Type Error
        return $false
    }
    Write-Log "Backend directory OK" -Type Success
    
    if (-not (Test-Path $script:Config.FrontendDir)) {
        Write-Log "Frontend directory tidak ditemukan: $($script:Config.FrontendDir)" -Type Error
        return $false
    }
    Write-Log "Frontend directory OK" -Type Success
    
    Write-Log "Semua prerequisites OK" -Type Success
    return $true
}
Set-Alias -Name Check-Prerequisites -Value Test-Prerequisites

# ===============================================================================
# Command Functions
# ===============================================================================

function Invoke-StartApi {
    Write-Header "Backend API"
    
    Write-Log "Starting backend API server on http://localhost:8080..." -Type Info
    Write-Log "Press Ctrl+C to stop" -Type Warning
    
    Write-Host ""
    Write-Log "Endpoints:" -Type Info
    Write-Log "  Health    : GET http://localhost:8080/livez" -Type Info
    Write-Log "  Meta      : GET http://localhost:8080/api/v1/meta" -Type Info
    Write-Log "  Login     : POST http://localhost:8080/api/v1/auth/login" -Type Info
    Write-Log "  Dashboard : http://localhost:8080/" -Type Info
    Write-Host ""
    
    Push-Location $script:Config.BackendDir
    try {
        & go run ./cmd/api api
    }
    finally {
        Pop-Location
    }
}

function Invoke-StartWorker {
    Write-Header "Background Worker"
    
    Write-Log "Starting background worker..." -Type Info
    Write-Log "Press Ctrl+C to stop" -Type Warning
    
    Push-Location $script:Config.BackendDir
    try {
        & go run ./cmd/api worker
    }
    finally {
        Pop-Location
    }
}

function Invoke-StartFrontend {
    Write-Header "Frontend Dev Server"
    
    Write-Log "Starting Vite dev server on http://localhost:5173..." -Type Info
    Write-Log "Press Ctrl+C to stop" -Type Warning
    
    Push-Location $script:Config.FrontendDir
    try {
        # Install deps if needed
        if (-not (Test-Path "node_modules")) {
            Write-Log "Installing dependencies..." -Type Info
            & npm install
        }
        
        if ($Force) {
            Write-Log "Forcing Vite dependency re-optimization..." -Type Info
            & npm run dev -- --force
        } else {
            & npm run dev
        }
    }
    finally {
        Pop-Location
    }
}

function Get-EnvValue {
    param([string]$Key, [string]$Default = "")
    
    $envFile = $script:Config.EnvFile
    if (-not (Test-Path $envFile)) { return $Default }
    
    $line = Get-Content $envFile | Where-Object { $_ -match "^$Key=" } | Select-Object -Last 1
    if ($null -eq $line) { return $Default }
    
    $value = ($line -split '=', 2)[1].Trim().Trim('"')
    return $value
}

function Invoke-StartGateway {
    Write-Header "WhatsApp Gateway"
    
    # Check if whatsapp directory exists
    if (-not (Test-Path $script:Config.WhatsAppDir)) {
        Write-Log "WhatsApp directory tidak ditemukan: $($script:Config.WhatsAppDir)" -Type Error
        Write-Log "Pastikan folder 'whatsapp/' ada di root repository." -Type Warning
        return
    }
    
    Write-Log "Starting WhatsApp Gateway on http://localhost:3001..." -Type Info
    Write-Log "Press Ctrl+C to stop" -Type Warning
    
    Push-Location $script:Config.WhatsAppDir
    try {
        # Install deps if needed
        if (-not (Test-Path "node_modules")) {
            Write-Log "Installing WhatsApp gateway dependencies..." -Type Info
            & npm install
        }
        
        # Load env vars from backend/.env so the gateway can read them
        $waPort      = Get-EnvValue -Key "WA_GATEWAY_PORT"            -Default "3001"
        $apiUrl      = Get-EnvValue -Key "DASHBOARD_API_URL"          -Default "http://localhost:8080"
        $apiKey      = Get-EnvValue -Key "DASHBOARD_INTERNAL_API_KEY" -Default ""
        $discordUrl  = Get-EnvValue -Key "DISCORD_WEBHOOK_URL"        -Default ""
        
        $env:PORT                        = $waPort
        $env:DASHBOARD_API_URL           = $apiUrl
        $env:DASHBOARD_INTERNAL_API_KEY  = $apiKey
        $env:API_KEY                     = $apiKey
        if ($discordUrl) {
            $env:DISCORD_WEBHOOK_URL     = $discordUrl
        }
        
        Write-Host ""
        Write-Log "Gateway port    : $waPort"  -Type Info
        Write-Log "Backend URL     : $apiUrl"  -Type Info
        if ($discordUrl) {
            Write-Log "Discord webhook : configurado" -Type Info
        }
        Write-Host ""
        
        & node src/server.js
    }
    finally {
        Pop-Location
    }
}

function Invoke-RunTests {
    Write-Header "Running Tests"
    
    Push-Location $script:Config.BackendDir
    try {
        Write-Log "Menjalankan backend tests..." -Type Info
        & go test ./... -v -timeout 30s
        
        Write-Host ""
        Write-Log "Tests selesai" -Type Success
    }
    finally {
        Pop-Location
    }
}

function Invoke-WatchTests {
    Write-Header "Watch Mode Tests"
    
    Write-Log "Running tests in watch mode..." -Type Info
    Write-Log "Tests akan dijalankan ulang saat file berubah" -Type Info
    Write-Log "Press Ctrl+C to stop" -Type Warning
    
    Push-Location $script:Config.BackendDir
    try {
        # Simple watch: just run tests and wait
        Write-Log "Note: Windows doesn't have built-in file watcher like Linux" -Type Warning
        Write-Log "Masukkan jumlah kali untuk rerun (atau Ctrl+C untuk exit):" -Type Info
        
        for ($i = 1; $i -le 5; $i++) {
            Clear-Host
            Write-Host "=======================================================================" -ForegroundColor Yellow
            Write-Host "Run #$i - $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Yellow
            Write-Host "=======================================================================" -ForegroundColor Yellow
            
            & go test ./... -timeout 10s
            
            Write-Host ""
            Write-Log "Ctrl+C untuk stop, atau tunggu untuk rerun..." -Type Info
            Start-Sleep -Seconds 3
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-StartAll {
    Write-Header "Starting All Services"
    
    Write-Log "Untuk best experience, jalankan di terminal terpisah:" -Type Info
    Write-Host ""
    Write-Host "Terminal 1 - Backend API:" -ForegroundColor Green
    Write-Host "  cd $($script:Config.BackendDir)" -ForegroundColor Gray
    Write-Host "  go run ./cmd/api api" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Terminal 2 - Frontend Dev:" -ForegroundColor Green
    Write-Host "  cd $($script:Config.FrontendDir)" -ForegroundColor Gray
    Write-Host "  npm run dev" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Terminal 3 - Tests (optional):" -ForegroundColor Green
    Write-Host "  cd $($script:Config.BackendDir)" -ForegroundColor Gray
    Write-Host "  go test ./... -v" -ForegroundColor Gray
    Write-Host ""
    
    Write-Log "Atau gunakan script lagi untuk start individual service" -Type Info
    Write-Host ""
    Write-Host "Contoh:" -ForegroundColor Cyan
    Write-Host "  .\quickstart-windows.ps1 api" -ForegroundColor Gray
    Write-Host "  .\quickstart-windows.ps1 frontend" -ForegroundColor Gray
    Write-Host "  .\quickstart-windows.ps1 test" -ForegroundColor Gray
    Write-Host ""
    
    # Check WhatsApp gateway status
    $waEnabled = Get-EnvValue -Key "ENABLE_WHATSAPP" -Default "false"
    if ($waEnabled -eq "true") {
        Write-Host "Terminal 3 - WhatsApp Gateway:" -ForegroundColor Green
        Write-Host "  cd $($script:Config.WhatsAppDir)" -ForegroundColor Gray
        Write-Host "  node src/server.js" -ForegroundColor Gray
        Write-Host "  -- atau --" -ForegroundColor DarkGray
        Write-Host "  .\deploy\go-dev\quickstart-windows.ps1 whatsapp" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Log "WhatsApp Gateway: DISABLED (set ENABLE_WHATSAPP=true di backend/.env untuk mengaktifkan)" -Type Warning
        Write-Host ""
    }
    
    Write-Log "Starting backend API in background..." -Type Info
    $job = Start-Job -ScriptBlock {
        Set-Location $using:script:Config.BackendDir
        & go run ./cmd/api api
    } -Name "backend-api"
    
    Start-Sleep -Seconds 5
    
    Write-Log "Backend started as job #$($job.Id)" -Type Success
    Write-Log "Buka terminal baru untuk frontend development" -Type Info
    if ($waEnabled -eq "true") {
        Write-Log "Buka terminal lain untuk WhatsApp gateway" -Type Info
    }
    Write-Log "Check status dengan: Get-Job" -Type Info
    Write-Log "Stop dengan: Stop-Job -Name backend-api" -Type Info
}

function Invoke-Clean {
    Write-Header "Cleaning Temporary Files & Binaries"
    
    Write-Log "Cleaning repository root binaries..." -Type Info
    Remove-Item -Path "$($script:Config.RepoRoot)\*.exe" -Force -ErrorAction SilentlyContinue
    
    Write-Log "Cleaning backend..." -Type Info
    Push-Location $script:Config.BackendDir
    try {
        Get-ChildItem -Path . -Filter *.exe -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        Remove-Item -Path @("build", "dist", "bin") -Recurse -Force -ErrorAction SilentlyContinue
        
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = 'SilentlyContinue'
        $null = & go clean -cache -testcache 2>&1
        $ErrorActionPreference = $prevPref
        
        Write-Log "Backend cleaned" -Type Success
    }
    finally {
        Pop-Location
    }
    
    Write-Log "Cleaning frontend..." -Type Info
    Push-Location $script:Config.FrontendDir
    try {
        Remove-Item -Path @("dist", "build", "node_modules\.vite") -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "Frontend cleaned" -Type Success
    }
    finally {
        Pop-Location
    }
    
    Write-Log "Cleanup complete!" -Type Success
}

function Invoke-Reset {
    Write-Header "FULL RESET - Hapus Semua Data dan State"

    $waDir      = $script:Config.WhatsAppDir
    # DB default ada di whatsapp/storage/ (lihat database.js)
    $waDbDir    = Join-Path $waDir "storage"
    $waDbPath   = Join-Path $waDbDir "wa_gateway.db"
    $waDbShm    = Join-Path $waDbDir "wa_gateway.db-shm"
    $waDbWal    = Join-Path $waDbDir "wa_gateway.db-wal"
    # Legacy path (root whatsapp/) - hapus juga kalau ada
    $waDbLegacy = Join-Path $waDir "wa_gateway.db"
    $waStorage  = Join-Path $waDir "storage"
    $waSessions = Join-Path $waDir "src\whatsapp\sessions"
    $waWwebjs   = Join-Path $waDir ".wwebjs_cache"
    $waTemp     = Join-Path $waDir "temp"
    $backendEnv = $script:Config.EnvFile
    $waEnv      = Join-Path $waDir ".env"
    $dbPath     = $script:Config.DbPath
    $dbShm      = $dbPath -replace '\.db$', '.db-shm'
    $dbWal      = $dbPath -replace '\.db$', '.db-wal'

    Write-Host ""
    Write-Host "  Yang akan DIHAPUS:" -ForegroundColor Red
    Write-Host "  -------------------------------------------------------" -ForegroundColor Red
    Write-Host "  [DB]    Dashboard database  : $dbPath" -ForegroundColor Red
    Write-Host "  [DB]    WA Gateway database : $waDbPath" -ForegroundColor Red
    Write-Host "  [WA]    WA session files    : $waSessions" -ForegroundColor Red
    Write-Host "  [WA]    wwebjs cache        : $waWwebjs" -ForegroundColor Red
    Write-Host "  [WA]    WA temp files       : $waTemp" -ForegroundColor Red
    Write-Host "  [WA]    WA storage uploads  : $waStorage" -ForegroundColor Red
    Write-Host "  [ENV]   backend/.env        : $backendEnv" -ForegroundColor Yellow
    Write-Host "  [ENV]   whatsapp/.env       : $waEnv" -ForegroundColor Yellow
    Write-Host "  [CACHE] Go build cache, frontend .vite cache" -ForegroundColor Yellow
    Write-Host "  -------------------------------------------------------" -ForegroundColor Red
    Write-Host ""
    Write-Host "  [!] Semua data pelanggan, tagihan, sesi login, dan" -ForegroundColor Yellow
    Write-Host "      koneksi WhatsApp akan HILANG PERMANEN." -ForegroundColor Yellow
    Write-Host ""

    $confirm = Read-Host "Ketik RESET (huruf besar semua) untuk melanjutkan, atau Enter untuk batal"
    if ($confirm -ne 'RESET') {
        Write-Log "Dibatalkan. Tidak ada yang diubah." -Type Info
        return
    }

    Write-Host ""
    Write-Log "Memulai full reset..." -Type Warning
    Write-Host ""

    # 1. Dashboard SQLite DB
    Write-Log "[1/7] Menghapus Dashboard database..." -Type Info
    foreach ($f in @($dbPath, $dbShm, $dbWal)) {
        if (Test-Path $f) {
            Remove-Item -Path $f -Force -ErrorAction SilentlyContinue
            Write-Log "      Deleted: $f" -Type Success
        }
    }
    $backupDir = Join-Path $script:Config.StorageDir "backups"
    if (Test-Path $backupDir) {
        Remove-Item -Path $backupDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "      Deleted: $backupDir" -Type Success
    }

    # 2. WA Gateway SQLite DB
    Write-Log "[2/7] Menghapus WhatsApp Gateway database..." -Type Info
    foreach ($f in @($waDbPath, $waDbShm, $waDbWal, $waDbLegacy,
                     ($waDbLegacy + "-wal"), ($waDbLegacy + "-shm"))) {
        if (Test-Path $f) {
            Remove-Item -Path $f -Force -ErrorAction SilentlyContinue
            Write-Log "      Deleted: $f" -Type Success
        }
    }

    # 3. WA Session files (Chromium auth / LocalAuth)
    Write-Log "[3/7] Menghapus WhatsApp session files (Chromium)..." -Type Info
    if (Test-Path $waSessions) {
        Remove-Item -Path $waSessions -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "      Deleted: $waSessions" -Type Success
    }

    # 4. wwebjs_cache dan temp
    Write-Log "[4/7] Menghapus wwebjs cache..." -Type Info
    if (Test-Path $waWwebjs) {
        Remove-Item -Path $waWwebjs -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "      Deleted: $waWwebjs" -Type Success
    }
    if (Test-Path $waTemp) {
        Remove-Item -Path $waTemp -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "      Deleted: $waTemp" -Type Success
    }

    # 5. WA storage (uploaded media)
    Write-Log "[5/7] Menghapus WA Gateway storage..." -Type Info
    if (Test-Path $waStorage) {
        Remove-Item -Path $waStorage -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "      Deleted: $waStorage" -Type Success
    }

    # 6. .env files
    Write-Log "[6/7] Menghapus .env files..." -Type Info
    foreach ($envFile in @($backendEnv, $waEnv)) {
        if (Test-Path $envFile) {
            Remove-Item -Path $envFile -Force -ErrorAction SilentlyContinue
            Write-Log "      Deleted: $envFile" -Type Success
        }
    }

    # 7. Build caches
    Write-Log "[7/7] Membersihkan build caches..." -Type Info
    Push-Location $script:Config.BackendDir
    try {
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = 'SilentlyContinue'
        $null = & go clean -cache -testcache 2>&1
        $ErrorActionPreference = $prevPref
        if ($LASTEXITCODE -eq 0) {
            Write-Log "      Go cache cleared" -Type Success
        } else {
            Write-Log "      Go cache: sebagian tidak bisa dihapus (proses backend mungkin masih berjalan - tidak apa-apa)" -Type Warning
        }
    } catch {
        Write-Log "      Go cache: skip (pastikan backend sudah dihentikan sebelum reset untuk hasil terbaik)" -Type Warning
    } finally { Pop-Location }

    Push-Location $script:Config.FrontendDir
    try {
        Remove-Item -Path @("dist", "node_modules\.vite") -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "      Frontend vite cache cleared" -Type Success
    } finally { Pop-Location }


    Write-Host ""
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Log "  FULL RESET SELESAI - semua data dihapus." -Type Success
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Host ""
    Write-Log "Langkah selanjutnya:" -Type Info
    Write-Log "  1. .\deploy\go-dev\quickstart-windows.ps1 setup-env  (buat ulang .env)" -Type Info
    Write-Log "  2. .\deploy\go-dev\quickstart-windows.ps1 api        (start backend)" -Type Info
    Write-Log "  3. .\deploy\go-dev\quickstart-windows.ps1 whatsapp   (start WA gateway)" -Type Info
    Write-Log "  4. .\deploy\go-dev\quickstart-windows.ps1 frontend   (start frontend)" -Type Info
    Write-Host ""
}

function Show-Help {

    $help = @"

=======================================================================
  Menet-Tech Dashboard Go - Windows Quick Start Helper
=======================================================================

PENGGUNAAN:
  .\quickstart-windows.ps1 [command]

COMMANDS:

  (none)        Tampilkan instruksi untuk start semua services
  api           Start backend API
  worker        Start background worker
  frontend      Start frontend dev server
  whatsapp      Start WhatsApp Gateway (Node.js, port 3001)
  test          Run backend tests once
  watch         Run backend tests (re-run 5x)
  check         Verify prerequisites
  setup-env     Setup .env file
  clean         Bersihkan temp files & caches
  reset         Reset TOTAL: hapus semua DB, WA sessions, .env, cache
  help          Show help message (ini)

EXAMPLES:

  # Check prerequisites
  .\quickstart-windows.ps1 check

  # Backend only
  .\quickstart-windows.ps1 api

  # Frontend only
  .\quickstart-windows.ps1 frontend

  # Frontend only with forced dependency optimization (fixes outdated/504 dependencies cache)
  .\quickstart-windows.ps1 frontend -Force

  # Run tests
  .\quickstart-windows.ps1 test

  # Setup .env
  .\quickstart-windows.ps1 setup-env

REQUIREMENTS:

  - Go >= 1.26    (https://golang.org/dl)
  - Node.js >= 18 (https://nodejs.org)
  - PowerShell 5.0+

WORKFLOW TYPICAL:

  1. Clone repository
     git clone <repo-url>
     cd Dashboard

  2. Check prerequisites
     .\deploy\go-dev\quickstart-windows.ps1 check

  3. Setup environment
     .\deploy\go-dev\quickstart-windows.ps1 setup-env

  4. Start backend (Terminal 1)
     .\deploy\go-dev\quickstart-windows.ps1 api

  5. Start frontend (Terminal 2)
     .\deploy\go-dev\quickstart-windows.ps1 frontend

  6. Open browser
     http://localhost:8080

  7. Login dengan credentials:
     Username: admin
     Password: admin123

TROUBLESHOOTING:

  "Command not found" errors:
    - Install Go & Node.js
    - Restart PowerShell/Terminal
    - Check PATH: echo `$env:PATH

  "Port 8080 already in use":
    - Edit backend\.env dan ubah HTTP_ADDR
    - Atau gunakan netstat untuk find/kill process

  Tests failing:
    - Run: .\quickstart-windows.ps1 test
    - Check output untuk error details

  Database errors:
    - Run: .\quickstart-windows.ps1 reset
    - Database akan diinit ulang

FILES:

  Repository root: $($script:Config.RepoRoot)
  Backend:        $($script:Config.BackendDir)
  Frontend:       $($script:Config.FrontendDir)
  Config file:    $($script:Config.EnvFile)

DOCUMENTATION:

  - Backend README:     .\backend\README.md
  - Frontend README:    .\frontend\README.md
  - Blueprint:         .\docs\go-dev\BLUEPRINT.md
  - Architecture:      .\docs\go-dev\ARCHITECTURE.md

SUPPORT:

  Jika ada issues, check:
    1. Dokumentasi di .\docs\go-dev\
    2. Backend logs: output dari terminal
    3. Frontend console: Browser DevTools (F12)

"@
    
    Write-Host $help
}

# ===============================================================================
# Main
# ===============================================================================

function Main {
    Write-Host ""
    Write-Host "=======================================================================" -ForegroundColor Cyan
    Write-Host "   Menet-Tech Dashboard Go - Windows Quick Start" -ForegroundColor Cyan
    Write-Host "=======================================================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Ensure storage dir exists
    $null = New-Item -ItemType Directory -Path $script:Config.StorageDir -Force -ErrorAction SilentlyContinue
    
    # Setup env if not exists (skip for 'reset' and 'setup-env' commands)
    if ($Command -ne 'reset' -and $Command -ne 'setup-env') {
        if (-not (Test-Path $script:Config.EnvFile)) {
            Initialize-EnvFile
            Write-Host ""
        }
        Import-EnvFile
    }
    
    # Route command
    switch ($Command) {
        "api" {
            Invoke-StartApi
        }
        "worker" {
            Invoke-StartWorker
        }
        "frontend" {
            Invoke-StartFrontend
        }
        "whatsapp" {
            $waEnabled = Get-EnvValue -Key "ENABLE_WHATSAPP" -Default "false"
            if ($waEnabled -ne "true") {
                Write-Log "ENABLE_WHATSAPP tidak diset ke 'true' di backend/.env" -Type Warning
                Write-Log "Set ENABLE_WHATSAPP=true lalu jalankan ulang." -Type Warning
                Write-Host ""
                $confirm = Read-Host "Lanjutkan tetap jalankan gateway? (y/N)"
                if ($confirm -ne 'y' -and $confirm -ne 'Y') {
                    Write-Log "Dibatalkan." -Type Info
                    return
                }
            }
            Invoke-StartGateway
        }
        "test" {
            Invoke-RunTests
        }
        "watch" {
            Invoke-WatchTests
        }
        "check" {
            Test-Prerequisites
        }
        "setup-env" {
            Initialize-EnvFile
        }
        "clean" {
            Invoke-Clean
        }
        "reset" {
            Invoke-Reset
        }
        "help" {
            Show-Help
        }
        default {
            if ([string]::IsNullOrWhiteSpace($Command)) {
                # Show default instructions
                Test-Prerequisites
                if ($?) {
                    Invoke-StartAll
                }
            }
            else {
                Write-Log "Unknown command: $Command" -Type Error
                Write-Host ""
                Show-Help
            }
        }
    }
}

# Run main
Main
