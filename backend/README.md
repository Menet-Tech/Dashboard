# Backend Go

Backend rewrite `go-dev` memakai:
- Go
- Chi router
- SQLite (`modernc.org/sqlite`)
- session cookie auth
- worker mode untuk billing automation

## Jalankan Lokal

### API

```bash
go mod tidy
go run ./cmd/api api
```

### Worker

```bash
go run ./cmd/api worker
```

#### Billing Automation & Resilience Behavior
The background worker automatically executes scheduled billing generation, trial expiry, auto backups, and reminder/limit actions. To ensure high reliability and prevent failure cascades in production, the worker implements the following stability measures:
- **WhatsApp Gateway Fault Tolerance**: WhatsApp transmission failures or API gateway downtime (e.g., connection timeouts or REST gateway errors) are logged as `slog` errors but do **not** abort the background worker cycle or halt processing for other customers.
- **Discord Alert Deduplication**: Discord notifications for **Isolir (Limit)** are strictly triggered only during the initial state transition (from active to limit). Subsequent worker cycles will not generate duplicate Discord alerts for already-limited customers.
- **Data Integrity Fail-Safes**: Any database records with malformed or invalid due dates are logged and safely skipped, preventing a single malformed record from blocking the entire billing pipeline.
- **Distributed Lease Pattern**: The worker uses a database-backed lock lease pattern (`worker_lock`) to coordinate single-active worker execution in multi-replica environments.

### Legacy Import (MySQL -> SQLite)

```bash
LEGACY_MYSQL_DSN="user:pass@tcp(127.0.0.1:3306)/dashboard?parseTime=true&charset=utf8mb4" \
IMPORT_DRY_RUN=true \
go run ./cmd/api import
```

Jika hasil dry-run sudah sesuai, ubah `IMPORT_DRY_RUN=false` untuk eksekusi nyata.

Server default berjalan di `:8080`.

## Environment

Key utama:
- `APP_NAME`
- `APP_ENV`
- `HTTP_ADDR`
- `SQLITE_PATH`
- `STORAGE_PATH`
- `SESSION_COOKIE_NAME`
- `SESSION_COOKIE_SECURE`
- `SESSION_TTL_HOURS`
- `LOGIN_MAX_ATTEMPTS`
- `LOGIN_WINDOW_MINUTES`
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`

Contoh production baseline tersedia di:
- [backend/.env.example](/D:/xampp/htdocs/Dashboard/backend/.env.example)

## Health Endpoint

- `GET /livez`
- `GET /readyz`
- `GET /health`

## Catatan Production

Dokumen deployment Ubuntu ada di:
- [docs/go-dev/PRODUCTION.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/PRODUCTION.md)

Dokumen migration data ada di:
- [docs/go-dev/DATA_MIGRATION.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/DATA_MIGRATION.md)
