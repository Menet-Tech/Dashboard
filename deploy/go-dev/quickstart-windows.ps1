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
#   setup-env      - Setup .env file only
#   clean          - Bersihkan temp files & caches
#   reset          - Reset database & environment
#   help           - Show help
# ===============================================================================

param(
    [Parameter(Position = 0)]
    [ValidateSet("api", "worker", "frontend", "test", "watch", "check", "setup-env", "clean", "reset", "help", $null)]
    [string]$Command = ""
)

# Handle null/empty command
if ($null -eq $Command) {
    $Command = ""
}

$ErrorActionPreference = "Stop"

# ===============================================================================
# Configuration
# ===============================================================================

$backendPath = Join-Path -Path (Get-Location).Path -ChildPath "backend"
$frontendPath = Join-Path -Path (Get-Location).Path -ChildPath "frontend"
$storagePath = Join-Path -Path (Get-Location).Path -ChildPath "storage"

$script:Config = @{
    RepoRoot      = (Get-Location).Path
    BackendDir    = $backendPath
    FrontendDir   = $frontendPath
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

function Setup-EnvFile {
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
"@
    
    $null = New-Item -ItemType File -Path $script:Config.EnvFile -Force
    Set-Content -Path $script:Config.EnvFile -Value $envContent -Encoding UTF8
    
    Write-Log ".env file created: $($script:Config.EnvFile)" -Type Success
    Write-Log "Default password: admin123 (ubah jika perlu)" -Type Warning
}

function Check-Prerequisites {
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
        
        & npm run dev
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
    
    Write-Log "Starting backend API in background..." -Type Info
    $job = Start-Job -ScriptBlock {
        Set-Location $using:script:Config.BackendDir
        & go run ./cmd/api api
    } -Name "backend-api"
    
    Start-Sleep -Seconds 5
    
    Write-Log "Backend started as job #$($job.Id)" -Type Success
    Write-Log "Buka terminal baru untuk frontend development" -Type Info
    Write-Log "Check status dengan: Get-Job" -Type Info
    Write-Log "Stop dengan: Stop-Job -Name backend-api" -Type Info
}

function Invoke-Clean {
    Write-Header "Cleaning Temporary Files"
    
    Write-Log "Cleaning backend..." -Type Info
    Push-Location $script:Config.BackendDir
    try {
        Remove-Item -Path @("build", "dist", "bin", "*.exe") -Recurse -Force -ErrorAction SilentlyContinue
        & go clean -cache -testcache -ErrorAction SilentlyContinue
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
    Write-Header "Reset Development Environment"
    
    Write-Log "Ini akan:" -Type Warning
    Write-Log "  - Delete SQLite database" -Type Warning
    Write-Log "  - Clean cache" -Type Warning
    Write-Log "  - Reset ke state awal" -Type Warning
    Write-Host ""
    
    $response = Read-Host "Lanjutkan? (y/N)"
    
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Log "Dibatalkan" -Type Info
        return
    }
    
    Write-Log "Removing database..." -Type Info
    Remove-Item -Path $script:Config.DbPath -Force -ErrorAction SilentlyContinue
    
    Invoke-Clean
    
    Write-Log "Environment reset complete!" -Type Success
    Write-Log "Jalankan quickstart lagi untuk menginit database" -Type Info
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
  test          Run backend tests once
  watch         Run backend tests (re-run 5x)
  check         Verify prerequisites
  setup-env     Setup .env file
  clean         Bersihkan temp files & caches
  reset         Reset database & environment
  help          Show help message (ini)

EXAMPLES:

  # Check prerequisites
  .\quickstart-windows.ps1 check

  # Backend only
  .\quickstart-windows.ps1 api

  # Frontend only
  .\quickstart-windows.ps1 frontend

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
    
    # Setup env if not exists
    if (-not (Test-Path $script:Config.EnvFile)) {
        Setup-EnvFile
        Write-Host ""
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
        "test" {
            Invoke-RunTests
        }
        "watch" {
            Invoke-WatchTests
        }
        "check" {
            Check-Prerequisites
        }
        "setup-env" {
            Setup-EnvFile
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
                Check-Prerequisites
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
