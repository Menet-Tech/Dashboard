# Architecture — Menet-Tech Dashboard

## Tech Stack

### Backend
- **Language**: Go 1.24+
- **Router**: `chi`
- **Database**: SQLite via `modernc.org/sqlite` (pure Go, no CGO required)
- **Auth**: Session cookie (HTTP-only, CSRF-protected)
- **Migrations**: sequential SQL files under `backend/internal/platform/migrate/sql/`
- **Config**: environment variables (loaded from `.env`)
- **Logging**: `log/slog` — text in dev, JSON in production
- **Scheduler**: built-in worker mode (`./menettech worker`), lease-locked against double-run

### Frontend
- **Framework**: React 19 + TypeScript
- **Build tool**: Vite
- **Styling**: Vanilla CSS + Tailwind v4 (utility classes)
- **Charts**: Chart.js via react-chartjs-2
- **State**: custom hooks per domain (`useCustomers`, `useBills`, `usePackages`, etc.)
- **API client**: `fetch` with session cookie; CSRF token handled transparently

### Deployment
- Single Go binary serves both the API and the built React static assets
- No Nginx required for basic production; optional Nginx for TLS termination
- `systemd` manages API and worker as separate services

---

## System Topology

```
React SPA (browser)
    │  HTTP + session cookie
    ▼
Go HTTP API (chi router, :8080)
    ├── SQLite database (WAL mode)
    ├── WhatsApp Gateway (external HTTP)
    ├── Discord Webhook (external HTTP)
    └── MikroTik RouterOS API (TCP 8728)

Go Worker (background process, same binary)
    ├── Monthly billing automation
    ├── Due-date reminder notifications
    ├── Auto-limit (isolir) via MikroTik
    ├── Daily backup
    └── Heartbeat + lease lock
```

---

## Backend Architecture

Pattern: **handler → service → repository → SQLite**

### Handler
- Parse and validate HTTP request
- Check auth/CSRF via middleware
- Map domain result to JSON response
- Never contains business logic

### Service
- All business rules live here
- Orchestrates repository calls
- Composes notifications
- Manages state transitions

### Repository
- Raw SQL queries
- Returns domain structs
- No business logic

---

## Domain Model

### Customers
- `status`: `active` | `limit` | `inactive`
- `due_day`: integer day-of-month for monthly due date
- `is_trial`: boolean; trial customers follow a separate lifecycle

### Bills
- DB status: `belum_bayar` | `lunas` (kept simple for queries)
- Display status (computed in service): `belum_bayar` | `jatuh_tempo` | `menunggak` | `lunas`
- Default billing rules (all configurable via Settings):
  - Reminder: 3 days before due date
  - Limit: 5 days after due date
  - Menunggak: 30 days after due date

### Invoice Number Format
```
dd-mm-yyyy/customer_id/speed_mbps/serial
Example: 27-04-2026/15/20/003
```

### WhatsApp Trigger Keys
- `reminder_custom` — pre-due reminder
- `jatuh_tempo` — due date
- `limit_5hari` — 5 days past due
- `lunas` — payment confirmed

---

## Database Strategy

### Why SQLite
- Ideal for single-VPS ISP operations
- File-based backups are trivial
- Zero infrastructure overhead

### SQLite Config (applied at startup)
```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
```

### Write Contention
- Worker runs as a separate process with a lease lock (`worker_lock_*` settings keys)
- Background jobs execute serially within the worker cycle
- No parallel writes from the worker

---

## Auth Strategy

- **Session cookie** (HTTP-only, `SameSite=Strict`)
- **CSRF token** required for all mutating requests (injected into login response, must be sent as `X-CSRF-Token` header)
- Login rate-limited per IP (`LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_MINUTES`)
- Roles: `admin` (full access) | `petugas` (operational, no config/audit)

---

## Frontend Architecture

- `App.tsx` — layout orchestrator, global auth/toast/confirm state
- `src/features/` — one folder per domain (dashboard, bills, customers, packages, templates, monitoring, settings, audit, users)
- `src/hooks/` — domain state hooks (useCustomers, useBills, usePackages, useTemplates, useUsers, useSettings, useMonitoring)
- `src/lib/api.ts` — all API calls, typed with domain types
- `src/types.ts` — shared TypeScript types
- `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge)

---

## Observability

- Structured request logging: method, path, status, latency, request_id (chi middleware)
- Audit log written to DB for all mutating operations
- `/health` endpoint: full snapshot of services, worker heartbeat, scheduler status, backup status, integration config
- `/livez` — process liveness
- `/readyz` — database readiness

---

## External Integrations

### WhatsApp Gateway
External service running `whatsapp-web.js`.  
Auth: `X-API-Key` header + `X-Account-Id` header.  
See [WHATSAPP_GATEWAY.md](WHATSAPP_GATEWAY.md) for full API reference.

### Discord
Webhook-based. Two configurable webhook URLs: billing channel + alert channel.

### MikroTik
RouterOS API over TCP (port 8728). Package: `backend/internal/mikrotik/`.  
Operations: `LimitUser` (add Simple Queue) and `UnlimitUser` (remove Simple Queue).

---

## Testing Strategy

### Backend
- Unit tests: service layer with mock repositories
- Integration tests: repository layer with in-memory SQLite
- Handler tests: `httptest` package
- Target: ≥ 80% coverage per package

### Frontend
- Vitest + React Testing Library (setup in progress)
- Target: ≥ 80% for `src/lib/` and `src/components/`

---

## Known Gaps (as of May 2026)

- Legacy MySQL → SQLite import not yet run with real production DSN
- MikroTik: config/readiness only; RouterOS real connection not tested on hardware
- Frontend test coverage is minimal
- Discord bot (Node.js legacy) not ported to Go
