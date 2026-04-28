# Menet-Tech Dashboard (`go-dev`)

Repository root ini sekarang difokuskan untuk rewrite `go-dev`:

- backend: Go
- frontend: React + TypeScript
- database: SQLite

## Folder utama

- `backend/` — API, worker, migration, import legacy
- `frontend/` — SPA admin panel
- `deploy/go-dev/` — systemd units, release helper, smoke checks
- `docs/go-dev/` — blueprint, architecture, roadmap, production, UAT, migration
- `legacy-code/` — codebase PHP/Node lama yang sudah dipindahkan dari root

## Quick start

### Backend API

```bash
cd backend
go run ./cmd/api api
```

### Worker

```bash
cd backend
go run ./cmd/api worker
```

### Frontend

```bash
cd frontend
npm run dev
```

## Verifikasi cepat

```bash
cd backend
go test ./... -timeout 120s
```

```bash
cd frontend
npm run build
```

## Dokumen penting

- `AGENTS.md`
- `HANDOFF_GO_DEV.md`
- `current_progress.md`
- `docs/go-dev/BLUEPRINT.md`
- `docs/go-dev/ARCHITECTURE.md`
- `docs/go-dev/ROADMAP.md`
- `docs/go-dev/PRODUCTION.md`
- `docs/go-dev/UAT_CHECKLIST.md`
- `docs/go-dev/DATA_MIGRATION.md`
