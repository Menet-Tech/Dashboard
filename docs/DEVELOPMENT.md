# Development Guide — Menet-Tech Dashboard

## Prerequisites

| Tool | Minimum Version | Notes |
|------|-----------------|-------|
| Go | 1.24+ | https://golang.org/dl |
| Node.js | 18+ | https://nodejs.org |
| npm | bundled with Node.js | |
| git | any recent | |

---

## Quick Start

### Option A — Manual (recommended for day-to-day)

```bash
# 1. Clone and configure
git clone <repo-url>
cd Dashboard
cp backend/.env.example backend/.env
# Edit backend/.env — at minimum set BOOTSTRAP_ADMIN_PASSWORD

# 2. Backend API (terminal 1)
cd backend
go run ./cmd/api api

# 3. Worker (terminal 2)
cd backend
go run ./cmd/api worker

# 4. Frontend (terminal 3)
cd frontend
npm install
npm run dev
```

URLs:
- Frontend dev: http://localhost:5173
- API + built frontend: http://localhost:8080

### Option B — Linux quickstart script (opens tmux session)

```bash
chmod +x deploy/go-dev/quickstart-linux.sh
./deploy/go-dev/quickstart-linux.sh
```

Opens 4 tmux windows: `backend`, `frontend`, `test`, `info`.

```bash
# Individual services
./deploy/go-dev/quickstart-linux.sh api
./deploy/go-dev/quickstart-linux.sh worker
./deploy/go-dev/quickstart-linux.sh frontend
./deploy/go-dev/quickstart-linux.sh test

# Tmux management
tmux attach -t menettech-dev
tmux kill-session -t menettech-dev
```

### Option C — Windows quickstart script

```powershell
# Check prerequisites
.\deploy\go-dev\quickstart-windows.ps1 check

# Setup .env
.\deploy\go-dev\quickstart-windows.ps1 setup-env

# Start backend
.\deploy\go-dev\quickstart-windows.ps1 api

# Start frontend (new terminal)
.\deploy\go-dev\quickstart-windows.ps1 frontend
```

---

## Environment Configuration

```bash
cp backend/.env.example backend/.env
```

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | `development` or `production` |
| `HTTP_ADDR` | `127.0.0.1:8080` | Listen address |
| `SQLITE_PATH` | `./storage/dashboard.db` | Database file path |
| `STORAGE_PATH` | `./storage` | Uploads and backups root |
| `FRONTEND_DIST_PATH` | *(empty)* | Path to built React assets (for production) |
| `SESSION_COOKIE_SECURE` | `false` | Set `true` in production (requires HTTPS) |
| `BOOTSTRAP_ADMIN_USERNAME` | `admin` | First-run admin username |
| `BOOTSTRAP_ADMIN_PASSWORD` | *(required)* | First-run admin password |
| `LOGIN_MAX_ATTEMPTS` | `5` | Login rate limit attempts |
| `LOGIN_WINDOW_MINUTES` | `10` | Login rate limit window |

---

## Running Tests

### Backend

```bash
cd backend
go test ./... -timeout 120s
```

Verbose output:
```bash
cd backend
go test ./... -v
```

With coverage report:
```bash
cd backend
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out
```

### Frontend

```bash
cd frontend
npm run build         # type-check + production build
npx tsc --noEmit      # type-check only (fast)
```

---

## Building

### Backend binary

```bash
cd backend
go build -o menettech-go ./cmd/api
```

### Frontend production assets

```bash
cd frontend
npm ci
npm run build
# Output: frontend/dist/
```

### Full release (backend + frontend + checksum)

```bash
chmod +x deploy/go-dev/release.sh
./deploy/go-dev/release.sh
```

---

## Backend Subcommands

The Go binary has three modes:

```bash
# HTTP API server
go run ./cmd/api api

# Background worker (billing, reminders, backup)
go run ./cmd/api worker

# Legacy MySQL → SQLite data import
LEGACY_MYSQL_DSN="user:pass@tcp(127.0.0.1:3306)/dashboard?parseTime=true&charset=utf8mb4" \
IMPORT_DRY_RUN=true \
go run ./cmd/api import

# Real import (after dry-run verified)
LEGACY_MYSQL_DSN="..." IMPORT_DRY_RUN=false go run ./cmd/api import
```

---

## Coding Conventions

### Backend

- Pattern: `handler → service → repository`
- All new handlers registered in `backend/internal/http/router/router.go`
- All protected routes use `authMiddleware` + `csrfMiddleware`
- Every new backend feature **must** have a `*_test.go` with ≥ 80% coverage
- Use `log/slog` for structured logging — never `fmt.Println` in production paths
- Never log sensitive fields: `password`, `api_key`, `wa_api_key`
- All migrations: new numbered file in `backend/internal/platform/migrate/sql/`; always use `CREATE TABLE IF NOT EXISTS`
- New setting keys: add to migration seed so defaults are present on fresh install

### Frontend

- Feature code in `src/features/<domain>/`
- Domain state in `src/hooks/use<Domain>.ts`
- Shared types in `src/types.ts`
- API calls in `src/lib/api.ts` — all calls must be typed
- Use `cn()` from `src/lib/utils.ts` for conditional Tailwind classes
- No inline `style={{}}` — use Tailwind utility classes or CSS custom properties
- Run `npx tsc --noEmit` before committing frontend changes

---

## Troubleshooting

### Port already in use

```bash
# Linux
lsof -i :8080 && kill -9 <PID>

# Windows
netstat -ano | findstr :8080
taskkill /PID <PID> /F
```

### Database locked / WAL stuck

```bash
# Stop all services first, then:
rm -f ./storage/dashboard.db-wal
rm -f ./storage/dashboard.db-shm
# Restart services
```

### Go not found

```bash
# Add to PATH
export PATH=$PATH:/usr/local/go/bin
# Make persistent: add to ~/.bashrc or ~/.zshrc
```

### Frontend build fails after node_modules deleted

```bash
cd frontend
npm install
npm run build
```

### Tests failing unexpectedly

```bash
# Run with verbose output to locate the failure
cd backend
go test ./... -v -timeout 120s
```

---

## Verification Checklist (after any significant change)

- [ ] `cd backend && go test ./... -timeout 120s` — passes
- [ ] `cd frontend && npx tsc --noEmit` — zero errors
- [ ] `cd backend && go build ./...` — compiles
- [ ] Login flow works end-to-end
- [ ] For billing changes: generate bill → mark paid → invoice → WA notification log
- [ ] For worker changes: `GET /health` shows `worker.last_heartbeat` updating
