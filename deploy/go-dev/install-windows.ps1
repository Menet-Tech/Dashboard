# ===============================================================================
# Menet-Tech Dashboard Go - Windows Installer
#
# Penggunaan:
#   1. Buka PowerShell sebagai Administrator
#   2. cd ke root repository
#   3. .\deploy\go-dev\install-windows.ps1
#
# Requirements:
#   - Go >= 1.26 (https://golang.org/dl)
#   - Node.js >= 18 (https://nodejs.org)
#   - Git (untuk clone repo)
#   - Windows 10/11
#   - Visual Studio Build Tools (optional, untuk CGO)
#
# Hasil:
#   - Directory struktur di repo
#   - Backend binary di ./output/windows/
#   - Frontend dist di ./output/windows/frontend-dist/
#   - .env file di ./backend/.env
# ===============================================================================

param(
    [switch]$SkipBuild = $false,
    [switch]$SkipTests = $false
)

# ===============================================================================
# Configuration
# ===============================================================================

$ErrorActionPreference = "Stop"
$VerbosePreference = "SilentlyContinue"

$script:Config = @{
    RepoRoot          = (Get-Location).Path
    OutputDir         = Join-Path (Get-Location) "output\windows"
    BackendDir        = Join-Path (Get-Location) "backend"
    FrontendDir       = Join-Path (Get-Location) "frontend"
    GoMinVersion      = "1.26"
    NodeMinVersion    = "18"
    EnvFileName       = ".env"
}

# Colors
$script:Colors = @{
    Info    = "Cyan"
    Success = "Green"
    Warning = "Yellow"
    Error   = "Red"
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
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = $script:Colors[$Type]
    
    $prefix = @{
        Info    = "[INFO]"
        Success = "[✓]"
        Warning = "[!]"
        Error   = "[✗]"
    }[$Type]
    
    Write-Host "$prefix [$timestamp] $Message" -ForegroundColor $color
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Cyan -NoNewline
    Write-Host " ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
}

# ===============================================================================
# Validation Functions
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

function Test-VersionGreaterOrEqual {
    param(
        [string]$CurrentVersion,
        [string]$MinVersion
    )
    
    $current = [version]$CurrentVersion
    $minimum = [version]$MinVersion
    
    return $current -ge $minimum
}

function Verify-Prerequisites {
    Write-Section "1️⃣  Verifying Prerequisites"
    
    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        Write-Log "PowerShell 5.0 atau lebih tinggi diperlukan" -Type Error
        exit 1
    }
    Write-Log "PowerShell version: $($PSVersionTable.PSVersion)" -Type Success
    
    # Check Go
    if (-not (Test-CommandExists "go")) {
        Write-Log "Go belum terinstall! Download dari: https://golang.org/dl" -Type Error
        exit 1
    }
    
    $goVersion = go version | Select-Object -First 1 | ForEach-Object { $_ -match 'go(\d+\.\d+)' | Out-Null; $matches[1] }
    Write-Log "Go version: $goVersion"
    
    if (-not (Test-VersionGreaterOrEqual $goVersion $script:Config.GoMinVersion)) {
        Write-Log "Go $($script:Config.GoMinVersion) atau lebih tinggi diperlukan, ditemukan: $goVersion" -Type Error
        exit 1
    }
    Write-Log "Go version OK" -Type Success
    
    # Check Node.js
    if (-not (Test-CommandExists "node")) {
        Write-Log "Node.js belum terinstall! Download dari: https://nodejs.org" -Type Error
        exit 1
    }
    
    $nodeVersion = node -v | ForEach-Object { $_ -replace '^v', '' }
    Write-Log "Node.js version: $nodeVersion"
    
    if (-not (Test-VersionGreaterOrEqual $nodeVersion $script:Config.NodeMinVersion)) {
        Write-Log "Node.js $($script:Config.NodeMinVersion) atau lebih tinggi diperlukan, ditemukan: $nodeVersion" -Type Error
        exit 1
    }
    Write-Log "Node.js version OK" -Type Success
    
    # Check npm
    if (-not (Test-CommandExists "npm")) {
        Write-Log "npm belum terinstall (biasanya bundled dengan Node.js)" -Type Error
        exit 1
    }
    Write-Log "npm OK" -Type Success
    
    # Check Git
    if (-not (Test-CommandExists "git")) {
        Write-Log "Git tidak ditemukan (optional, tapi recommended)" -Type Warning
    }
    else {
        Write-Log "Git OK" -Type Success
    }
}

# ===============================================================================
# Setup Functions
# ===============================================================================

function Initialize-Directories {
    Write-Section "2️⃣  Initializing Directory Structure"
    
    $dirs = @(
        $script:Config.OutputDir,
        (Join-Path $script:Config.OutputDir "backend"),
        (Join-Path $script:Config.OutputDir "frontend-dist"),
        (Join-Path $script:Config.OutputDir "storage\uploads"),
        (Join-Path $script:Config.OutputDir "storage\backups")
    )
    
    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            $null = New-Item -ItemType Directory -Path $dir -Force
            Write-Log "Created: $dir" -Type Success
        }
        else {
            Write-Log "Already exists: $dir" -Type Info
        }
    }
}

function Test-RepositoryStructure {
    Write-Log "Memverifikasi struktur repository..."
    
    if (-not (Test-Path (Join-Path $script:Config.RepoRoot "backend\go.mod"))) {
        Write-Log "backend/go.mod tidak ditemukan!" -Type Error
        exit 1
    }
    Write-Log "backend/go.mod ✓"
    
    if (-not (Test-Path (Join-Path $script:Config.RepoRoot "frontend\package.json"))) {
        Write-Log "frontend/package.json tidak ditemukan!" -Type Error
        exit 1
    }
    Write-Log "frontend/package.json ✓"
    
    Write-Log "Repository structure OK" -Type Success
}

# ===============================================================================
# Build Functions
# ===============================================================================

function Build-Backend {
    Write-Section "3️⃣  Building Backend"
    
    if ($SkipBuild) {
        Write-Log "Skipping backend build (--SkipBuild)" -Type Warning
        return
    }
    
    $backendDir = $script:Config.BackendDir
    $outputPath = Join-Path $script:Config.OutputDir "backend\menettech-go.exe"
    
    Write-Log "Backend directory: $backendDir"
    Write-Log "Output: $outputPath"
    
    try {
        # Change to backend directory
        Push-Location $backendDir
        
        # Run tests unless skipped
        if (-not $SkipTests) {
            Write-Log "Running backend tests..."
            $result = & go test ./... -timeout 120s
            
            if ($LASTEXITCODE -ne 0) {
                Write-Log "Backend tests failed!" -Type Error
                Pop-Location
                exit 1
            }
            Write-Log "Backend tests passed" -Type Success
        }
        else {
            Write-Log "Skipping tests (--SkipTests)" -Type Warning
        }
        
        # Build binary
        Write-Log "Compiling backend..."
        $result = & go build -o $outputPath ./cmd/api
        
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Failed to compile backend!" -Type Error
            Pop-Location
            exit 1
        }
        
        Write-Log "Backend binary created: $outputPath" -Type Success
        
        Pop-Location
    }
    catch {
        Write-Log "Error building backend: $_" -Type Error
        Pop-Location
        exit 1
    }
}

function Build-Frontend {
    Write-Section "4️⃣  Building Frontend"
    
    if ($SkipBuild) {
        Write-Log "Skipping frontend build (--SkipBuild)" -Type Warning
        return
    }
    
    $frontendDir = $script:Config.FrontendDir
    $outputPath = Join-Path $script:Config.OutputDir "frontend-dist"
    
    Write-Log "Frontend directory: $frontendDir"
    Write-Log "Output: $outputPath"
    
    try {
        Push-Location $frontendDir
        
        # Install dependencies
        Write-Log "Installing frontend dependencies..."
        $result = & npm ci
        
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Failed to install dependencies!" -Type Error
            Pop-Location
            exit 1
        }
        
        # Build
        Write-Log "Building frontend..."
        $result = & npm run build
        
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Failed to build frontend!" -Type Error
            Pop-Location
            exit 1
        }
        
        Write-Log "Frontend built successfully" -Type Success
        
        # Copy dist
        Write-Log "Copying dist to output directory..."
        
        # Remove old dist if exists
        if (Test-Path $outputPath) {
            Remove-Item $outputPath -Recurse -Force
        }
        
        Copy-Item -Path (Join-Path $frontendDir "dist") -Destination $outputPath -Recurse
        
        Write-Log "Frontend dist: $outputPath" -Type Success
        
        Pop-Location
    }
    catch {
        Write-Log "Error building frontend: $_" -Type Error
        Pop-Location
        exit 1
    }
}

# ===============================================================================
# Configuration Functions
# ===============================================================================

function Setup-EnvFile {
    Write-Section "5️⃣  Setting up Environment File"
    
    $envPath = Join-Path $script:Config.BackendDir $script:Config.EnvFileName
    
    if (Test-Path $envPath) {
        Write-Log ".env sudah ada di $envPath" -Type Warning
        Write-Log "Edit manual jika diperlukan" -Type Info
        return
    }
    
    $envContent = @'
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
'@
    
    try {
        Set-Content -Path $envPath -Value $envContent -Encoding UTF8
        Write-Log ".env file created: $envPath" -Type Success
    }
    catch {
        Write-Log "Failed to create .env file: $_" -Type Error
        exit 1
    }
}

# ===============================================================================
# Verification Functions
# ===============================================================================

function Verify-Installation {
    Write-Section "6️⃣  Verifying Installation"
    
    $checks = @{
        "Backend binary" = Test-Path (Join-Path $script:Config.OutputDir "backend\menettech-go.exe")
        "Frontend dist" = Test-Path (Join-Path $script:Config.OutputDir "frontend-dist\index.html")
        ".env file" = Test-Path (Join-Path $script:Config.BackendDir $script:Config.EnvFileName)
        "Storage directory" = Test-Path (Join-Path $script:Config.OutputDir "storage")
    }
    
    $passed = 0
    $total = $checks.Count
    
    foreach ($check in $checks.GetEnumerator()) {
        if ($check.Value) {
            Write-Log "$($check.Key)" -Type Success
            $passed++
        }
        else {
            Write-Log "$($check.Key)" -Type Warning
        }
    }
    
    Write-Log ""
    Write-Log "Verification: $passed/$total checks passed"
    
    if ($passed -eq $total) {
        Write-Log "Instalasi successful! ✓" -Type Success
        return $true
    }
    else {
        Write-Log "Beberapa komponen tidak terverifikasi. Cek output di atas." -Type Warning
        return $false
    }
}

# ===============================================================================
# Post-Install Information
# ===============================================================================

function Show-PostInstallInfo {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                  INSTALASI BERHASIL SELESAI ✓                              ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    
    $info = @"

📁 Output Directory: $($script:Config.OutputDir)

📋 LANGKAH SELANJUTNYA:

1. 🚀 RUN BACKEND API
   PowerShell:
   > cd $($script:Config.BackendDir)
   > .\go run ./cmd/api api
   
   Atau jalankan compiled binary:
   > & '$($script:Config.OutputDir)\backend\menettech-go.exe' api
   
   API akan tersedia di: http://127.0.0.1:8080

2. 🔄 RUN WORKER (optional)
   Di terminal terpisah:
   > cd $($script:Config.BackendDir)
   > go run ./cmd/api worker

3. 🌐 RUN FRONTEND (optional - jika ada dev server)
   Di terminal terpisah:
   > cd $($script:Config.FrontendDir)
   > npm run dev
   
   Frontend dev akan tersedia di: http://localhost:5173

4. ⚙️  KONFIGURASI
   Edit environment file:
   - Path: $($script:Config.BackendDir)\$($script:Config.EnvFileName)
   
   Default credentials (untuk development):
   - Username: admin
   - Password: admin123 (ubah di .env jika perlu)

5. 🧪 TEST APLIKASI
   Login ke: http://127.0.0.1:8080/
   
   Atau test API direct:
   > curl http://127.0.0.1:8080/livez
   > curl http://127.0.0.1:8080/readyz

📚 DOKUMENTASI:
   - Backend: .\backend\README.md
   - Frontend: .\frontend\README.md
   - Docs: .\docs\go-dev\BLUEPRINT.md

🛠️  QUICK DEVELOPMENT COMMANDS:

   Run backend:
   > cd backend && go run ./cmd/api api

   Run tests:
   > cd backend && go test ./...

   Watch tests:
   > cd backend && go test ./... -v

   Build release:
   > .\deploy\go-dev\release.sh

⚠️  NOTES:
   - Database akan auto-created saat startup pertama
   - Frontend dev server terpisah dari backend
   - Untuk production, lihat: .\docs\go-dev\PRODUCTION.md

"@
    
    Write-Host $info
}

# ===============================================================================
# Main Execution
# ===============================================================================

function Main {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║   Menet-Tech Dashboard Go - Windows Development Installer                  ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    Write-Log "Starting installation process..."
    
    Verify-Prerequisites
    Initialize-Directories
    Test-RepositoryStructure
    Build-Backend
    Build-Frontend
    Setup-EnvFile
    $verified = Verify-Installation
    
    Show-PostInstallInfo
    
    if ($verified) {
        Write-Log "Installation completed successfully!" -Type Success
        exit 0
    }
    else {
        Write-Log "Installation completed with some warnings. Please review above." -Type Warning
        exit 0
    }
}

# Run main
Main
