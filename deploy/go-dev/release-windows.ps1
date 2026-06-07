# Menet-Tech Dashboard Go - Linux Production Release Packager (PowerShell Windows)
#
# Penggunaan di PowerShell:
#   .\deploy\go-dev\release-windows.ps1
#
# Kegunaan:
#   Script ini berjalan di Windows dev environment (Go & Node.js terinstall)
#   untuk memproduksi paket rilis mandiri (offline release bundle) yang
#   siap di-upload ke server Ubuntu.
#
# Menghasilkan:
#   - deploy/go-dev/dist/menettech-release.zip

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$distDir = Join-Path $scriptDir "dist"
$tempReleaseDir = Join-Path $distDir "release_temp"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Packaging Menet-Tech Dashboard Go (Linux Target on Windows) " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# 1. Bersihkan dist sebelumnya
Write-Host "[1/6] Cleaning up previous builds..." -ForegroundColor Cyan
if (Test-Path $distDir) {
    Remove-Item -Path $distDir -Recurse -Force
}
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $tempReleaseDir -Force | Out-Null

# 2. Jalankan Backend Tests
Write-Host "[2/6] Running backend tests..." -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot "backend")
try {
    go test ./... -timeout 120s
} finally {
    Pop-Location
}

# 3. Cross-Compile Backend (Linux amd64)
Write-Host "[3/6] Cross-compiling backend binaries for Linux (amd64)..." -ForegroundColor Cyan
$backendReleaseDir = Join-Path $tempReleaseDir "backend"
New-Item -ItemType Directory -Path $backendReleaseDir -Force | Out-Null

Push-Location (Join-Path $repoRoot "backend")
try {
    # Set environment variables untuk cross-compilation
    $env:GOOS = "linux"
    $env:GOARCH = "amd64"

    Write-Host "  -> Compiling API & Worker (menettech-go)..."
    go build -ldflags="-s -w" -o (Join-Path $backendReleaseDir "menettech-go") ./cmd/api

    Write-Host "  -> Compiling Discord Bot (menettech-go-discord)..."
    go build -ldflags="-s -w" -o (Join-Path $backendReleaseDir "menettech-go-discord") ./cmd/discord-bot
} finally {
    # Reset environment variables
    $env:GOOS = $null
    $env:GOARCH = $null
    Pop-Location
}

# 4. Build Frontend
Write-Host "[4/6] Building frontend static assets..." -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot "frontend")
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "  -> Installing node_modules..."
        npm install
    }
    npm run build
} finally {
    Pop-Location
}

$frontendReleaseDir = Join-Path $tempReleaseDir "frontend-dist"
New-Item -ItemType Directory -Path $frontendReleaseDir -Force | Out-Null
Copy-Item -Path (Join-Path $repoRoot "frontend\dist\*") -Destination $frontendReleaseDir -Recurse -Force

# 5. Pack WhatsApp Gateway (tanpa node_modules/cache/db)
Write-Host "[5/6] Copying WhatsApp Gateway source files..." -ForegroundColor Cyan
$whatsappReleaseDir = Join-Path $tempReleaseDir "whatsapp"
New-Item -ItemType Directory -Path $whatsappReleaseDir -Force | Out-Null

$excludeList = @("node_modules", ".jest-cache", "coverage", "storage", "error.log", "combined.log")
Get-ChildItem -Path (Join-Path $repoRoot "whatsapp") | Where-Object { $_.Name -notin $excludeList } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $whatsappReleaseDir -Recurse -Force
}

# Salin install-linux.sh dan systemd templates
$deployReleaseDir = Join-Path $tempReleaseDir "deploy"
New-Item -ItemType Directory -Path $deployReleaseDir -Force | Out-Null
Copy-Item -Path (Join-Path $scriptDir "install-linux.sh") -Destination $deployReleaseDir -Force
Copy-Item -Path (Join-Path $scriptDir "*.service") -Destination $deployReleaseDir -Force

# 6. Buat Archive Zip
Write-Host "[6/6] Creating final zip package..." -ForegroundColor Cyan
$zipFile = Join-Path $distDir "menettech-release.zip"
Compress-Archive -Path (Join-Path $tempReleaseDir "*") -DestinationPath $zipFile -Force

# Bersihkan temporary folder
Remove-Item -Path $tempReleaseDir -Recurse -Force

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Build selesai!" -ForegroundColor Green
Write-Host "File rilis siap di-upload ke server Ubuntu:" -ForegroundColor Yellow
Write-Host "File: $zipFile" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
