# Menet-Tech Dashboard

ISP billing dashboard — Go backend, React + TypeScript frontend, SQLite, WhatsApp Gateway, and Discord Bot.

## What It Does

- Manage ISP customers, packages, and monthly billing
- Auto-generate bills via a background worker (scheduler)
- WhatsApp notifications for reminders, due dates, and payments
- Discord Bot connection (Gateway WebSocket) to execute commands (`/summary`, `/health`, `/tagihan`, `/pelanggan`)
- MikroTik integration (bi-directional sync, pull secrets, limit/unlimit PPPoE users)
- Backup, restore, and monitoring from a unified admin panel

## Quick Start (Local Development)

```bash
# 1. Copy and configure environment
cp backend/.env.example backend/.env
# Edit backend/.env (at minimum: BOOTSTRAP_ADMIN_PASSWORD)

# 2. Start all services using the quickstart helper:
# On Windows (PowerShell):
.\deploy\go-dev\quickstart-windows.ps1 setup-env
.\deploy\go-dev\quickstart-windows.ps1 frontend
.\deploy\go-dev\quickstart-windows.ps1 api
.\deploy\go-dev\quickstart-windows.ps1 worker
.\deploy\go-dev\quickstart-windows.ps1 whatsapp
```

## Release & Production Deployment

For clean deployment on a production Ubuntu server without installing compiler toolchains (Go/Node.js) on the server:

### 1. Build & Package (on local Dev machine)
* **On Windows**: Run `.\deploy\go-dev\release-windows.ps1` to compile Linux binaries and bundle them into `deploy/go-dev/dist/menettech-release.zip`.
* **On Linux/macOS**: Run `./deploy/go-dev/release.sh` to package into `deploy/go-dev/dist/menettech-release.tar.gz`.

### 2. Install on Target Server
Upload the package, extract it, and execute:
```bash
sudo ./deploy/install-linux.sh
```
The installer automatically runs in **Pre-compiled Mode**, registering systemd units for the API, Worker, Discord Bot, and WhatsApp services.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, tech stack, data flow, domain model |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, build, test, conventions, troubleshooting |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment, systemd, migration, rollback, soak test |
| [docs/API.md](docs/API.md) | All endpoints, auth, request/response reference |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planned features with specs, API contracts, and test requirements |
| [docs/UAT_CHECKLIST.md](docs/UAT_CHECKLIST.md) | Pre-production acceptance checklist |

## Repository Layout

```
backend/          Go API, worker, migrations, import tooling
frontend/         React SPA admin panel
whatsapp/         WhatsApp Gateway service (Node.js)
deploy/go-dev/    systemd units, install/quickstart scripts, smoke test, release tools
docs/             All documentation
```

