# Menet-Tech Dashboard

ISP billing dashboard — Go backend, React + TypeScript frontend, SQLite.

## What It Does

- Manage ISP customers, packages, and monthly billing
- Auto-generate bills via a background worker (scheduler)
- WhatsApp notifications for reminders, due dates, and payments
- Discord alerts for operational events
- MikroTik integration (limit/unlimit PPPoE users)
- Backup, restore, and monitoring from a unified admin panel

## Quick Start

```bash
# 1. Copy and configure environment
cp backend/.env.example backend/.env
# Edit backend/.env (at minimum: BOOTSTRAP_ADMIN_PASSWORD)

# 2. Backend API
cd backend
go run ./cmd/api api

# 3. Background worker (separate terminal)
cd backend
go run ./cmd/api worker

# 4. Frontend dev server (separate terminal)
cd frontend
npm install
npm run dev
```

Open: http://localhost:5173 (dev) or http://localhost:8080 (served by Go binary)

Default credentials: `admin` / value of `BOOTSTRAP_ADMIN_PASSWORD` in `.env`

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, tech stack, data flow, domain model |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, build, test, conventions, troubleshooting |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment, systemd, migration, rollback, soak test |
| [docs/API.md](docs/API.md) | All endpoints, auth, request/response reference |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planned features with specs, API contracts, and test requirements |
| [docs/UAT_CHECKLIST.md](docs/UAT_CHECKLIST.md) | Pre-production acceptance checklist |
| [docs/WHATSAPP_GATEWAY.md](docs/WHATSAPP_GATEWAY.md) | WhatsApp Gateway API reference (external integration) |

## Repository Layout

```
backend/          Go API, worker, migrations, import tooling
frontend/         React SPA admin panel
deploy/go-dev/    systemd units, install/quickstart scripts, smoke test
docs/             All documentation
legacy-code/      Archived PHP/Node.js codebase (read-only reference)
```
