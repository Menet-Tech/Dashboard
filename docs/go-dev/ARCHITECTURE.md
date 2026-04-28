# Go Dev Architecture

## Stack yang Direkomendasikan

### Backend

- Go 1.24+
- Router: `chi`
- DB access: `sqlc` + `database/sql`
- SQLite driver: `modernc.org/sqlite` atau `github.com/mattn/go-sqlite3`
- Migrations: `golang-migrate`
- Config: `caarlos0/env` atau `koanf`
- Logging: `slog`
- Validation: `go-playground/validator`

### Frontend

- React 19
- Vite
- TypeScript
- React Router
- TanStack Query
- Zod
- Tailwind CSS atau shadcn/ui
- Chart.js atau Recharts

### Scheduler

Opsi awal:
- tetap satu binary backend
- scheduler dijalankan sebagai subcommand: `./menettech worker`

Contoh:
- `./menettech api`
- `./menettech worker`
- `./menettech migrate`

## Topologi Aplikasi

```text
React SPA
   |
   v
Go HTTP API
   |
   +-- SQLite
   +-- WhatsApp Gateway
   +-- Discord Webhook
   +-- MikroTik API
```

## Struktur Repository yang Disarankan

```text
/go-dev/
  /apps/
    /api/
    /web/
  /internal/
    /auth/
    /billing/
    /customers/
    /packages/
    /settings/
    /templates/
    /monitoring/
    /scheduler/
    /notifications/
    /mikrotik/
    /store/
  /migrations/
  /openapi/
  /deploy/
  /scripts/
  go.mod
```

Atau jika tetap satu repo root:

```text
/backend
/frontend
/migrations
/docs/go-dev
```

## Arsitektur Backend

Gunakan pola:
- `handler`
- `service`
- `repository`

Contoh:

```text
handler -> service -> repository -> sqlite
```

### Handler

Tanggung jawab:
- parse request
- auth check
- validate input
- map response JSON

### Service

Tanggung jawab:
- aturan bisnis
- transaksi
- compose notifikasi
- state transition

### Repository

Tanggung jawab:
- query SQL
- persistence

## Domain yang Disarankan

### Auth
- login
- logout
- session validation

### Customers
- CRUD pelanggan
- quick status update

### Packages
- CRUD paket

### Billing
- generate tagihan
- daftar tagihan
- mark paid
- invoice numbering
- status computation

### Templates
- CRUD template WA
- parse placeholder

### Notifications
- kirim WA
- kirim Discord

### Monitoring
- service snapshots
- health logs

### Scheduler
- generate monthly bills
- due reminders
- auto limit
- auto backup

## Auth Strategy

Untuk fase awal, paling simpel:
- session cookie auth
- backend renderless API auth
- frontend pakai `fetch` dengan cookie

Kenapa bukan JWT dulu:
- lebih sederhana untuk dashboard internal
- lebih aman untuk revocation
- lebih dekat dengan kebutuhan admin panel

## API Style

Gunakan REST JSON.

Contoh:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/customers`
- `POST /api/v1/customers`
- `PATCH /api/v1/customers/:id/status`
- `GET /api/v1/bills`
- `POST /api/v1/bills/generate`
- `POST /api/v1/bills/:id/pay`
- `POST /api/v1/bills/:id/send-wa`
- `GET /api/v1/bills/:id/invoice`

## Database Strategy

### Kenapa SQLite

Cocok untuk:
- single VPS
- operasional internal
- deployment ringan
- backup file-based

### Konsekuensi

- pastikan write tidak terlalu paralel
- gunakan WAL mode
- index harus rapi
- heavy analytics jangan berlebihan di fase awal

### Rekomendasi SQLite PRAGMA

- `journal_mode=WAL`
- `foreign_keys=ON`
- `busy_timeout=5000`

## Migration Strategy

Migrations harus source of truth baru.

Jangan membawa file `database.sql` lama apa adanya.

Lakukan:
1. desain ulang schema untuk SQLite
2. siapkan migration SQL berurutan
3. buat importer dari MySQL lama jika perlu

## Frontend Architecture

Gunakan SPA admin panel.

Prinsip:
- route per module
- form schema dengan Zod
- request data via TanStack Query
- central API client
- reusable table and filter components

## Hal yang Sengaja Disederhanakan di Awal

- tidak ada SSR
- tidak ada microservice
- tidak ada message broker
- tidak ada websocket real-time

## Integrasi Eksternal

### WhatsApp Gateway

Tetap pakai kontrak existing:
- `POST /api/v1/messages`
- `X-API-Key`
- `X-Account-Id`

### Discord

Tetap webhook-based untuk backend.

### MikroTik

Ada dua opsi:
1. panggil RouterOS dari Go langsung
2. bungkus adapter internal agar mudah diganti

Rekomendasi:
- buat package `internal/mikrotik`
- service billing tidak tahu detail protokolnya

## Observability

Minimal:
- structured log
- request id
- audit log ke DB
- health snapshot table

Opsional nanti:
- Prometheus metrics
- Sentry

## Testing Strategy

### Backend

- unit test untuk service
- repository test dengan sqlite temp db
- handler test via `httptest`

### Frontend

- vitest
- react testing library

### Coverage target awal

- backend unit/integration: 80%
- frontend critical modules: 60%+
