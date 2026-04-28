# Instalasi & Quick Start Guides

Dokumentasi ini menjelaskan cara setup dan menjalankan Menet-Tech Dashboard Go di Linux dan Windows.

## Pilihan Cepat

### 🐧 Linux

**Production Installation** (untuk server/Ubuntu):
```bash
sudo chmod +x deploy/go-dev/install-linux.sh
sudo ./deploy/go-dev/install-linux.sh
```

**Development Quick Start** (untuk development lokal):
```bash
chmod +x deploy/go-dev/quickstart-linux.sh
./deploy/go-dev/quickstart-linux.sh
```

### 🪟 Windows

**Development Installation** (untuk Windows):
```powershell
.\deploy\go-dev\install-windows.ps1
```

**Development Quick Start** (untuk development lokal):
```powershell
.\deploy\go-dev\quickstart-windows.ps1
```

---

## 📋 Perbandingan Script

| Script | OS | Tujuan | Output |
|--------|----|---------|----|
| `install-linux.sh` | Linux/Ubuntu | Production deployment | `/opt/menettech-go/` + systemd units |
| `install-windows.ps1` | Windows | Development setup | `./output/windows/` |
| `quickstart-linux.sh` | Linux/Ubuntu | Development quick start | Running services |
| `quickstart-windows.ps1` | Windows | Development quick start | Running services |

---

## 🐧 Linux: Production Installation

Untuk deployment ke server Ubuntu/Debian.

### Requirements

- Ubuntu 22.04 / 24.04 atau Debian 12+
- sudo/root access
- Go >= 1.26
- Node.js >= 18
- ~2GB disk space

### Steps

```bash
# 1. Clone repository
git clone <repo-url> /home/user/menettech-dashboard
cd /home/user/menettech-dashboard

# 2. Run installer sebagai root
sudo chmod +x deploy/go-dev/install-linux.sh
sudo ./deploy/go-dev/install-linux.sh

# 3. Follow post-install instructions

# 4. Setup .env configuration
sudo nano /opt/menettech-go/backend/.env

# 5. Start services
sudo systemctl start menettech-go-api
sudo systemctl start menettech-go-worker

# 6. Check status
sudo systemctl status menettech-go-api
```

### What installer-linux.sh does

1. ✅ Check Go & Node.js versions
2. ✅ Create service user `menettech`
3. ✅ Create directory structure di `/opt/menettech-go/`
4. ✅ Build backend binary
5. ✅ Build frontend production assets
6. ✅ Setup SQLite database
7. ✅ Create `.env` file
8. ✅ Configure systemd units
9. ✅ Verify installation

### Post-Installation

#### Minimal Setup

```bash
# Edit .env - WAJIB ganti password!
sudo nano /opt/menettech-go/backend/.env

# Start services
sudo systemctl start menettech-go-api
sudo systemctl start menettech-go-worker

# Enable auto-start on boot
sudo systemctl enable menettech-go-api
sudo systemctl enable menettech-go-worker
```

#### Setup Nginx (Optional)

```bash
# Create nginx config
sudo nano /etc/nginx/sites-available/menettech

# Add content:
upstream menettech {
    server 127.0.0.1:8080;
}

server {
    listen 80;
    server_name dashboard.example.com;
    client_max_body_size 50M;
    
    location / {
        proxy_pass http://menettech;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/menettech /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### SSL dengan Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d dashboard.example.com
```

### Troubleshooting

**Service won't start**
```bash
sudo journalctl -u menettech-go-api -n 50 -e
```

**Permission denied**
```bash
sudo chown -R menettech:menettech /opt/menettech-go
```

**Database locked**
```bash
# Stop services
sudo systemctl stop menettech-go-api
sudo systemctl stop menettech-go-worker

# Remove lock file
rm -f /opt/menettech-go/storage/dashboard.db-wal

# Start again
sudo systemctl start menettech-go-api
```

---

## 🐧 Linux: Development Quick Start

Untuk development lokal di Linux/Ubuntu.

### Quick Start (semua services)

```bash
chmod +x deploy/go-dev/quickstart-linux.sh
./deploy/go-dev/quickstart-linux.sh
```

Ini akan membuka tmux session dengan 4 windows:
- `backend` - Backend API (http://localhost:8080)
- `frontend` - Frontend dev (http://localhost:5173)
- `test` - Tests watch mode
- `info` - Info & management

### Start Individual Service

```bash
# Backend API only
./deploy/go-dev/quickstart-linux.sh api

# Frontend dev only
./deploy/go-dev/quickstart-linux.sh frontend

# Worker background
./deploy/go-dev/quickstart-linux.sh worker

# Run tests once
./deploy/go-dev/quickstart-linux.sh test

# Run tests in watch mode
./deploy/go-dev/quickstart-linux.sh watch
```

### Other Commands

```bash
# Check prerequisites
./deploy/go-dev/quickstart-linux.sh check

# Setup .env file
./deploy/go-dev/quickstart-linux.sh setup-env

# Clean temporary files
./deploy/go-dev/quickstart-linux.sh clean

# Reset database & environment
./deploy/go-dev/quickstart-linux.sh reset

# Show help
./deploy/go-dev/quickstart-linux.sh help
```

### Tmux Management

```bash
# Reattach to session
tmux attach -t menettech-dev

# Kill session
tmux kill-session -t menettech-dev

# List sessions
tmux list-sessions

# Switch window dalam tmux: Ctrl+B then [0-9]
# Scroll output: Ctrl+B then [
# Kill window: Ctrl+B then X
```

---

## 🪟 Windows: Development Installation

Untuk setup development di Windows.

### Requirements

- Windows 10 / 11
- PowerShell 5.0+
- Go >= 1.26 (https://golang.org/dl)
- Node.js >= 18 (https://nodejs.org)
- Visual Studio Build Tools (optional, untuk CGO)
- ~3GB disk space

### Steps

```powershell
# 1. Buka PowerShell (tidak perlu admin)

# 2. Clone repository
git clone <repo-url>
cd Dashboard

# 3. Run installer
.\deploy\go-dev\install-windows.ps1

# 4. Follow post-install instructions

# 5. Start backend
cd backend
go run ./cmd/api api

# 6. Start frontend (terminal baru)
cd frontend
npm run dev

# 7. Open browser
# http://localhost:8080 (backend/frontend)
# http://localhost:5173 (frontend dev)
```

### What install-windows.ps1 does

1. ✅ Check Go & Node.js versions
2. ✅ Create `output\windows\` directory structure
3. ✅ Run backend tests
4. ✅ Build backend binary
5. ✅ Build frontend production assets
6. ✅ Setup `.env` file
7. ✅ Verify installation

### After Installation

Binaries tersedia di: `.\output\windows\backend\menettech-go.exe`

```powershell
# Run compiled backend
.\output\windows\backend\menettech-go.exe api

# Or use go run
cd backend
go run ./cmd/api api
```

### Development Options

```powershell
# Option 1: Full installation
.\deploy\go-dev\install-windows.ps1

# Option 2: Skip tests (faster)
.\deploy\go-dev\install-windows.ps1 -SkipTests

# Option 3: Skip build (only setup env)
.\deploy\go-dev\install-windows.ps1 -SkipBuild
```

---

## 🪟 Windows: Development Quick Start

Untuk development lokal di Windows tanpa perlu full installer.

### Quick Start

```powershell
# Check prerequisites
.\deploy\go-dev\quickstart-windows.ps1 check

# Setup .env
.\deploy\go-dev\quickstart-windows.ps1 setup-env

# Start backend
.\deploy\go-dev\quickstart-windows.ps1 api

# Start frontend (terminal baru)
.\deploy\go-dev\quickstart-windows.ps1 frontend

# Run tests
.\deploy\go-dev\quickstart-windows.ps1 test
```

### Commands

```powershell
# Show instructions
.\quickstart-windows.ps1

# Backend API
.\quickstart-windows.ps1 api

# Frontend dev
.\quickstart-windows.ps1 frontend

# Worker background
.\quickstart-windows.ps1 worker

# Run tests once
.\quickstart-windows.ps1 test

# Watch tests (re-run 5x)
.\quickstart-windows.ps1 watch

# Check prerequisites
.\quickstart-windows.ps1 check

# Setup .env
.\quickstart-windows.ps1 setup-env

# Clean temp files
.\quickstart-windows.ps1 clean

# Reset database
.\quickstart-windows.ps1 reset

# Show help
.\quickstart-windows.ps1 help
```

---

## 🔧 Default Configuration

### Credentials

Setelah instalasi, login dengan:
- **Username**: `admin`
- **Password**: `admin123` (development) atau yang sudah dikonfigurasi

### URLs

| Service | URL | Notes |
|---------|-----|-------|
| API | http://localhost:8080 | Backend API |
| Frontend | http://localhost:8080 | Production frontend |
| Frontend Dev | http://localhost:5173 | Development server (jika running) |
| Health | http://localhost:8080/livez | Health check |
| Ready | http://localhost:8080/readyz | Readiness check |

### Database

- **Type**: SQLite
- **Location**: `./storage/dashboard.db` (development)
- **Location**: `/opt/menettech-go/storage/dashboard.db` (production Linux)
- **Auto-migrate**: Yes, pada startup

### Environment Variables

Lihat `.env.example` di backend directory untuk variabel lengkap:

```bash
# Copy template
cp backend/.env.example backend/.env

# Edit sesuai kebutuhan
nano backend/.env
```

Key variables:
- `APP_ENV`: `development` atau `production`
- `HTTP_ADDR`: Address untuk listen (default: `127.0.0.1:8080`)
- `SQLITE_PATH`: Path ke database file
- `SESSION_COOKIE_SECURE`: `false` untuk dev, `true` untuk production
- `BOOTSTRAP_ADMIN_PASSWORD`: Password admin pertama kali

---

## 🐛 Troubleshooting

### Go Command Not Found

```bash
# Linux
export PATH=$PATH:/usr/local/go/bin

# Add to ~/.bashrc atau ~/.zshrc untuk persistent
```

### Node/npm Not Found

```bash
# Check installation
node -v
npm -v

# If not found, reinstall dari https://nodejs.org
```

### Port Already in Use

```bash
# Linux - Find process using port 8080
lsof -i :8080

# Windows - Find process using port 8080
netstat -ano | findstr :8080

# Kill process
kill -9 <PID>  # Linux
taskkill /PID <PID> /F  # Windows
```

### Database Lock Error

```bash
# Stop services
# Remove lock file
rm -f ./storage/dashboard.db-wal
rm -f ./storage/dashboard.db-shm

# Restart
```

### Tests Failing

```bash
# Linux
./deploy/go-dev/quickstart-linux.sh test

# Windows
.\deploy\go-dev\quickstart-windows.ps1 test

# Verbose output
cd backend
go test ./... -v
```

### Frontend Build Issues

```bash
# Clear node_modules
rm -rf frontend/node_modules
rm frontend/package-lock.json

# Reinstall
cd frontend
npm install
npm run build
```

---

## 📚 Documentation

Untuk informasi lebih lanjut:

- **Architecture**: `docs/go-dev/ARCHITECTURE.md`
- **Blueprint**: `docs/go-dev/BLUEPRINT.md`
- **Production Guide**: `docs/go-dev/PRODUCTION.md`
- **Data Migration**: `docs/go-dev/DATA_MIGRATION.md`
- **UAT Checklist**: `docs/go-dev/UAT_CHECKLIST.md`
- **Roadmap**: `docs/go-dev/ROADMAP.md`

---

## 🆘 Getting Help

Jika mengalami masalah:

1. **Cek dokumentasi** di `docs/go-dev/`
2. **Lihat logs**:
   - Linux production: `sudo journalctl -u menettech-go-api -f`
   - Linux dev: Console output dari quickstart
   - Windows: Console output atau browser DevTools
3. **Run diagnostics**:
   ```bash
   # Linux
   ./deploy/go-dev/quickstart-linux.sh check
   
   # Windows
   .\deploy\go-dev\quickstart-windows.ps1 check
   ```
4. **Perhatikan error messages** - mereka biasanya cukup informatif

---

## 🚀 Next Steps

### Development

1. Setup dengan quickstart script
2. Make code changes
3. Run tests: `go test ./...`
4. Frontend changes auto-reload via Vite
5. Check health endpoints

### Production Deployment

1. Run `install-linux.sh` di production server
2. Configure `.env` dengan production values
3. Setup Nginx reverse proxy
4. Setup SSL dengan Let's Encrypt
5. Monitor dengan `journalctl` atau ELK stack
6. Setup regular backups

---

Last Updated: 2026-04-28
