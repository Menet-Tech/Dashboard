# HANDOFF GO-DEV

Dokumen ini dibuat untuk AI agent atau developer yang akan melanjutkan rewrite branch `go-dev` tanpa harus audit ulang seluruh repo.

## Tujuan Branch

`go-dev` adalah rewrite dari dashboard billing ISP lama ke stack baru:
- backend: Go
- frontend: React + TypeScript
- database: SQLite

Targetnya bukan menyalin PHP lama 1:1, tetapi membawa aturan bisnis inti ke arsitektur yang lebih rapi, ringan, dan cocok untuk deployment Linux single-node.

## Wajib Baca Dulu

Urutan baca yang paling hemat konteks:
1. [AGENTS.md](/D:/xampp/htdocs/Dashboard/AGENTS.md)
2. [current_progress.md](/D:/xampp/htdocs/Dashboard/current_progress.md)
3. [docs/go-dev/BLUEPRINT.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/BLUEPRINT.md)
4. [docs/go-dev/ARCHITECTURE.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/ARCHITECTURE.md)
5. [docs/go-dev/ROADMAP.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/ROADMAP.md)

Kalau perlu detail implementasi, baru lanjut ke file domain terkait.

## Batasan Kerja

- Fokus hanya ke folder [backend](/D:/xampp/htdocs/Dashboard/backend), [frontend](/D:/xampp/htdocs/Dashboard/frontend), dan dokumentasi rewrite.
- Codebase legacy sudah dipindahkan ke [legacy-code](/D:/xampp/htdocs/Dashboard/legacy-code).
- Pertahankan pola `handler -> service -> repository`.
- Jangan menyimpang jauh dari blueprint tanpa alasan kuat.

## Status Nyata Saat Ini

Rewrite `go-dev` sudah lebih maju dari sekadar scaffold. Fitur yang sudah benar-benar ada:

- auth session cookie
- dashboard summary
- CRUD paket
- CRUD pelanggan
- update status pelanggan cepat
- generate tagihan manual
- daftar tagihan
- tandai lunas
- invoice HTML view
- upload bukti bayar
- computed status tagihan
- payment history dasar
- CRUD template WA
- settings API + UI
- WhatsApp sender foundation
- Discord webhook notification foundation
- worker loop
- worker heartbeat
- backup manual + list + download
- riwayat notifikasi WhatsApp per tagihan
- import legacy MySQL ke SQLite (dry-run / execute)
- release artifacts + checksum
- smoke check endpoint
- alert operasional di health/monitoring

## Struktur Penting

### Root repo

- rewrite aktif:
  - [backend](/D:/xampp/htdocs/Dashboard/backend)
  - [frontend](/D:/xampp/htdocs/Dashboard/frontend)
  - [docs/go-dev](/D:/xampp/htdocs/Dashboard/docs/go-dev)
  - [deploy/go-dev](/D:/xampp/htdocs/Dashboard/deploy/go-dev)
- legacy diparkir di:
  - [legacy-code](/D:/xampp/htdocs/Dashboard/legacy-code)

### Backend

- entrypoint: [backend/cmd/api/main.go](/D:/xampp/htdocs/Dashboard/backend/cmd/api/main.go)
- router: [backend/internal/http/router/router.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/router/router.go)
- config: [backend/internal/config/config.go](/D:/xampp/htdocs/Dashboard/backend/internal/config/config.go)
- SQLite bootstrap: [backend/internal/platform/database/sqlite.go](/D:/xampp/htdocs/Dashboard/backend/internal/platform/database/sqlite.go)
- migrations:
  - [backend/internal/platform/migrate/sql/0001_initial.sql](/D:/xampp/htdocs/Dashboard/backend/internal/platform/migrate/sql/0001_initial.sql)
  - [backend/internal/platform/migrate/sql/0002_notifications_settings.sql](/D:/xampp/htdocs/Dashboard/backend/internal/platform/migrate/sql/0002_notifications_settings.sql)

### Domain backend

- auth: [backend/internal/auth](/D:/xampp/htdocs/Dashboard/backend/internal/auth)
- billing: [backend/internal/billing](/D:/xampp/htdocs/Dashboard/backend/internal/billing)
- customers: [backend/internal/customers](/D:/xampp/htdocs/Dashboard/backend/internal/customers)
- packages: [backend/internal/packages](/D:/xampp/htdocs/Dashboard/backend/internal/packages)
- templates: [backend/internal/templates](/D:/xampp/htdocs/Dashboard/backend/internal/templates)
- settings: [backend/internal/settings](/D:/xampp/htdocs/Dashboard/backend/internal/settings)
- notifications: [backend/internal/notifications](/D:/xampp/htdocs/Dashboard/backend/internal/notifications)
- backup: [backend/internal/backup](/D:/xampp/htdocs/Dashboard/backend/internal/backup)
- worker: [backend/internal/worker](/D:/xampp/htdocs/Dashboard/backend/internal/worker)

### Frontend

- app shell utama: [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
- API client: [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)
- types: [frontend/src/types.ts](/D:/xampp/htdocs/Dashboard/frontend/src/types.ts)
- styles: [frontend/src/styles.css](/D:/xampp/htdocs/Dashboard/frontend/src/styles.css)

## Endpoint Yang Sudah Ada

### Public

- `GET /health`
- `GET /livez`
- `GET /readyz`
- `POST /api/v1/auth/login`
- `GET /api/v1/meta`

### Protected

- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `GET /api/v1/dashboard/summary`

#### Packages
- `GET /api/v1/packages`
- `POST /api/v1/packages`
- `PUT /api/v1/packages/{id}`
- `DELETE /api/v1/packages/{id}`

#### Customers
- `GET /api/v1/customers`
- `POST /api/v1/customers`
- `PUT /api/v1/customers/{id}`
- `PATCH /api/v1/customers/{id}/status`

#### Bills
- `GET /api/v1/bills`
- `POST /api/v1/bills/generate`
- `POST /api/v1/bills/{id}/pay`
- `GET /api/v1/bills/{id}/invoice`
- `GET /api/v1/bills/{id}/notifications`
- `POST /api/v1/bills/{id}/proof`

#### Templates
- `GET /api/v1/templates`
- `POST /api/v1/templates`
- `PUT /api/v1/templates/{id}`
- `DELETE /api/v1/templates/{id}`

#### Settings
- `GET /api/v1/settings`
- `PUT /api/v1/settings`

#### Backups
- `POST /api/v1/backups`
- `GET /api/v1/backups`
- `GET /api/v1/backups/{filename}/download`

## Command Tambahan Penting

### Legacy import

```bash
cd backend
go run ./cmd/api import
```

Env yang relevan:
- `LEGACY_MYSQL_DSN`
- `IMPORT_DRY_RUN`

### Release artifacts

Lihat:
- [deploy/go-dev/release.sh](/D:/xampp/htdocs/Dashboard/deploy/go-dev/release.sh)
- [deploy/go-dev/smoke.sh](/D:/xampp/htdocs/Dashboard/deploy/go-dev/smoke.sh)

## Aturan Bisnis Penting

### Pelanggan

- `due_day` dipakai sebagai tanggal jatuh tempo bulanan
- status pelanggan:
  - `active`
  - `limit`
  - `inactive`

### Tagihan

Status DB tetap sederhana:
- `belum_bayar`
- `lunas`

Status tampilan dihitung di service:
- `belum_bayar`
- `jatuh_tempo`
- `menunggak`
- `lunas`

Rule default:
- reminder: `3` hari sebelum jatuh tempo
- limit: `5` hari setelah jatuh tempo
- menunggak: `30` hari setelah jatuh tempo

Semua rule itu configurable lewat `pengaturan`.

### Invoice

Format nomor invoice:

`dd-mm-yyyy/id_pelanggan/kecepatan_paket/seri`

Contoh:

`27-04-2026/15/20/003`

### WhatsApp

Trigger template minimal yang sudah dipakai:
- `reminder_custom`
- `jatuh_tempo`
- `limit_5hari`
- `lunas`

## Cara Menjalankan

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

## Verifikasi Minimal Setelah Mengubah Kode

### Backend

```bash
cd backend
go test ./... -timeout 120s
```

### Frontend

```bash
cd frontend
npm run build
```

Kalau menyentuh handler penting, bagus juga cek manual:
- login
- generate tagihan
- tandai lunas
- invoice
- upload bukti bayar
- settings
- backup
- smoke check `/livez`, `/readyz`, `/health`

## Known Gap Yang Masih Relevan

- import data legacy real belum dijalankan karena DSN MySQL produksi belum diberikan
- cutover/UAT real di VPS target belum dijalankan
- role/permission saat ini baru dasar (`admin` / `petugas`)
- integrasi MikroTik baru sampai readiness/configuration, belum koneksi RouterOS real
- Discord bot belum dibawa ke rewrite Go
- test frontend masih minim

## Prioritas Aman Berikutnya

Kalau mau lanjut tanpa ubah arah besar, urutan yang paling aman:
1. Jalankan dry-run import dari MySQL legacy nyata lalu validasi report
2. Rehearsal deploy di VPS target memakai artefak `deploy/go-dev/dist`
3. Jalankan UAT checklist produksi
4. Implement koneksi MikroTik real untuk test/limit action
5. Tambah frontend test untuk flow kritikal

## Catatan Penting Untuk Agent Berikutnya

- Anggap [current_progress.md](/D:/xampp/htdocs/Dashboard/current_progress.md) sebagai log kronologis, tapi tetap cek code state aktual sebelum mengubah arsitektur.
- Beberapa progres di `go-dev` sudah melampaui milestone turn lama, jadi jangan asumsi status branch masih sebatas scaffold.
- Jika menambah fitur baru, update `current_progress.md` di turn baru.
- Jangan hapus atau ganti aturan bisnis lama tanpa mencatat alasannya di dokumentasi.
