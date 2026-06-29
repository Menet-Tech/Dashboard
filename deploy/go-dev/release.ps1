# Menet-Tech Dashboard Go - Production Release Builder (PowerShell)
#
# Penggunaan:
#   .\deploy\go-dev\release.ps1 linux
#
# Kegunaan:
#   Cross-compile semua binary untuk Linux (amd64) dan siapkan folder Releases
#   agar siap dikompres menjadi .zip atau .rar untuk di-upload ke server.
#
# Output:
#   D:\xampp\htdocs\Dashboard\Releases\
#     ├── Linux-installer.sh
#     ├── backend/
#     │   ├── api              (Go API binary - Linux amd64)
#     │   ├── worker           (Go Worker binary - Linux amd64)
#     │   ├── .env.example
#     │   └── storage/{uploads,Backup}/
#     ├── frontend/            (React dist files)
#     ├── integration/
#     │   ├── discord-bot      (Go Discord Bot binary - Linux amd64)
#     │   ├── .env.example
#     │   └── whatsapp/        (NodeJS source tanpa node_modules)
#     └── deploy/
#         ├── menettech-api.service
#         ├── menettech-worker.service
#         ├── menettech-discord.service
#         └── menettech-whatsapp.service

$ErrorActionPreference = "Stop"

# ─── Helpers ────────────────────────────────────────────────────────────────
function Write-Step($n, $total, $msg) {
    Write-Host "`n[$n/$total] $msg" -ForegroundColor Cyan
}
function Write-OK($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "  [x]  $msg" -ForegroundColor Red }

# ─── Validate target argument ────────────────────────────────────────────────
$target = $args[0]
if ($target -ne "linux") {
    Write-Err "Target tidak dikenal: '$target'"
    Write-Host "Penggunaan: .\deploy\go-dev\release.ps1 linux" -ForegroundColor Yellow
    exit 1
}

# ─── Resolve paths ──────────────────────────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..") | Select-Object -ExpandProperty Path
$releasesDir = Join-Path $repoRoot "Releases"
$TOTAL_STEPS = 8

Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Menet-Tech - Build & Package Release for Linux (amd64)" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Repo   : $repoRoot" -ForegroundColor Gray
Write-Host "  Target : $releasesDir" -ForegroundColor Gray
Write-Host "=========================================================" -ForegroundColor Green

# ─── Step 1: Clean & prepare Releases directory ──────────────────────────────
Write-Step 1 $TOTAL_STEPS "Membersihkan dan mempersiapkan folder Releases..."

Get-ChildItem -Path $releasesDir -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -notin @("backend")
} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Bersihkan isi backend kecuali storage
Get-ChildItem -Path (Join-Path $releasesDir "backend") -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -ne "storage"
} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Buat struktur direktori lengkap
New-Item -ItemType Directory -Force -Path (Join-Path $releasesDir "backend\storage\uploads") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releasesDir "backend\storage\Backup")  | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releasesDir "frontend")                | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releasesDir "integration\whatsapp")    | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releasesDir "deploy")                  | Out-Null
Write-OK "Folder structure siap"

# ─── Step 2: Run Backend Tests ───────────────────────────────────────────────
Write-Step 2 $TOTAL_STEPS "Menjalankan backend tests..."
Push-Location (Join-Path $repoRoot "backend")
try {
    go test ./... -timeout 120s
    Write-OK "Semua backend tests lulus"
}
finally {
    Pop-Location
}

# ─── Step 3: Cross-Compile Backend (Linux amd64) ────────────────────────────
Write-Step 3 $TOTAL_STEPS "Cross-compiling Go binaries untuk Linux (amd64)..."
$backendOut = Join-Path $releasesDir "backend"
Push-Location (Join-Path $repoRoot "backend")
try {
    $env:GOOS = "linux"
    $env:GOARCH = "amd64"

    Write-Host "  -> Compiling api (cmd/api)..."
    go build -ldflags="-s -w" -o (Join-Path $backendOut "api") ./cmd/api
    Write-OK "binary: $backendOut\api"

    Write-Host "  -> Compiling worker (sama dengan api, cmd/api dengan arg worker)..."
    # Worker menggunakan binary yang sama dengan api (cukup salin / buat symlink)
    Copy-Item -Path (Join-Path $backendOut "api") -Destination (Join-Path $backendOut "worker") -Force
    Write-OK "binary: $backendOut\worker"

    Write-Host "  -> Compiling discord-bot (cmd/discord-bot)..."
    $integrationOut = Join-Path $releasesDir "integration"
    go build -ldflags="-s -w" -o (Join-Path $integrationOut "discord-bot") ./cmd/discord-bot
    Write-OK "binary: $integrationOut\discord-bot"
}
finally {
    $env:GOOS = $null
    $env:GOARCH = $null
    Pop-Location
}

# ─── Step 4: Copy .env.example ───────────────────────────────────────────────
Write-Step 4 $TOTAL_STEPS "Menyalin .env.example..."

# Backend
$backendEnvExample = Join-Path $repoRoot "backend\.env.example"
if (Test-Path $backendEnvExample) {
    Copy-Item -Path $backendEnvExample -Destination (Join-Path $releasesDir "backend\.env.example") -Force
    Write-OK ".env.example disalin ke backend/"
}
else {
    Write-Warn "backend\.env.example tidak ditemukan, dilewati."
}

# Discord Bot (menggunakan template khusus, bukan backend .env)
$discordEnvExample = Join-Path $scriptDir "..\production\discord.env.example"
if (Test-Path $discordEnvExample) {
    Copy-Item -Path $discordEnvExample -Destination (Join-Path $releasesDir "integration\.env.example") -Force
    Write-OK ".env.example disalin ke integration/ (discord bot config)"
}
else {
    Write-Warn "discord.env.example tidak ditemukan di deploy\production\, dilewati."
}

# WhatsApp Gateway
$waEnvExample = Join-Path $repoRoot "whatsapp\.env.example"
if (Test-Path $waEnvExample) {
    Copy-Item -Path $waEnvExample -Destination (Join-Path $releasesDir "integration\whatsapp\.env.example") -Force
    Write-OK ".env.example disalin ke integration/whatsapp/"
}
else {
    Write-Warn "whatsapp\.env.example tidak ditemukan, dilewati."
}

# ─── Step 5: Build Frontend ──────────────────────────────────────────────────
Write-Step 5 $TOTAL_STEPS "Build frontend React+TypeScript (npm run build)..."
$frontendSrc = Join-Path $repoRoot "frontend"
Push-Location $frontendSrc
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "  -> node_modules tidak ada, menjalankan npm install..."
        npm install
    }
    npm run build
    Write-OK "Frontend build selesai"
}
finally {
    Pop-Location
}

$frontendDist = Join-Path $frontendSrc "dist"
if (Test-Path $frontendDist) {
    Copy-Item -Path (Join-Path $frontendDist "*") -Destination (Join-Path $releasesDir "frontend") -Recurse -Force
    Write-OK "Aset frontend disalin ke Releases\frontend\"
}
else {
    Write-Err "Folder dist frontend tidak ditemukan setelah build!"
    exit 1
}

# ─── Step 6: Pack WhatsApp Gateway (tanpa node_modules) ─────────────────────
Write-Step 6 $TOTAL_STEPS "Menyalin WhatsApp Gateway source (tanpa node_modules)..."
$waSrc = Join-Path $repoRoot "whatsapp"
$waDest = Join-Path $releasesDir "integration\whatsapp"
$excludeDirs = @("node_modules", ".wwebjs_cache", ".wwebjs_auth", "coverage", ".jest-cache", "storage")

Get-ChildItem -Path $waSrc | Where-Object {
    $_.Name -notin $excludeDirs
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $waDest -Recurse -Force
}
Write-OK "WhatsApp Gateway disalin ke Releases\integration\whatsapp\"

# ─── Step 7: Copy Deploy scripts & systemd services ─────────────────────────
Write-Step 7 $TOTAL_STEPS "Menyalin service files dan installer script..."
$deployOut = Join-Path $releasesDir "deploy"
$productionDir = Join-Path $scriptDir "..\production"

# Salin systemd service files
$serviceFiles = @(
    "menettech-api.service",
    "menettech-worker.service",
    "menettech-discord.service",
    "menettech-whatsapp.service"
)
foreach ($svc in $serviceFiles) {
    $srcSvc = Join-Path $productionDir $svc
    if (Test-Path $srcSvc) {
        Copy-Item -Path $srcSvc -Destination $deployOut -Force
        Write-OK "Disalin: deploy\$svc"
    }
    else {
        Write-Warn "Service file tidak ditemukan: $srcSvc"
    }
}

# Salin Linux-installer.sh ke root Releases
$installerSrc = Join-Path $repoRoot "Releases\Linux-installer.sh"
if (Test-Path $installerSrc) {
    Write-OK "Linux-installer.sh sudah ada di Releases\"
}
else {
    $fallbackInstaller = Join-Path $productionDir "install.sh"
    if (Test-Path $fallbackInstaller) {
        Copy-Item -Path $fallbackInstaller -Destination (Join-Path $releasesDir "Linux-installer.sh") -Force
        Write-OK "Linux-installer.sh disalin dari deploy\production\install.sh"
    }
    else {
        Write-Warn "install.sh tidak ditemukan di deploy\production\"
    }
}

# ─── Step 8: Verify & Print Summary ─────────────────────────────────────────
Write-Step 8 $TOTAL_STEPS "Verifikasi hasil..."

$checks = @(
    @{ Path = "$releasesDir\Linux-installer.sh"; Label = "Linux-installer.sh" },
    @{ Path = "$releasesDir\backend\api"; Label = "backend/api (Linux binary)" },
    @{ Path = "$releasesDir\backend\worker"; Label = "backend/worker (Linux binary)" },
    @{ Path = "$releasesDir\backend\.env.example"; Label = "backend/.env.example" },
    @{ Path = "$releasesDir\frontend\index.html"; Label = "frontend/index.html" },
    @{ Path = "$releasesDir\integration\discord-bot"; Label = "integration/discord-bot (Linux binary)" },
    @{ Path = "$releasesDir\integration\whatsapp\package.json"; Label = "integration/whatsapp/package.json" },
    @{ Path = "$releasesDir\deploy\menettech-api.service"; Label = "deploy/menettech-api.service" }
)

$allOk = $true
foreach ($c in $checks) {
    if (Test-Path $c.Path) {
        Write-OK $c.Label
    }
    else {
        Write-Warn "Tidak ditemukan: $($c.Label)"
        $allOk = $false
    }
}

Write-Host "`n=========================================================" -ForegroundColor Green
if ($allOk) {
    Write-Host "  Build BERHASIL! Folder Releases siap dikompres." -ForegroundColor Green
}
else {
    Write-Host "  Build SELESAI dengan beberapa peringatan di atas." -ForegroundColor Yellow
}
Write-Host "  Output : $releasesDir" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Langkah selanjutnya:" -ForegroundColor White
Write-Host "  1. Kompres folder Releases menjadi .zip atau .rar" -ForegroundColor Gray
Write-Host "  2. Upload ke server Linux" -ForegroundColor Gray
Write-Host "  3. Ekstrak dan jalankan: sudo ./Linux-installer.sh" -ForegroundColor Gray
Write-Host ""
