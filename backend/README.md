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
