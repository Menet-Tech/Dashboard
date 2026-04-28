# Go-Dev Production Guide

Dokumen ini khusus untuk deployment rewrite `go-dev` di Ubuntu Linux.

Referensi pendukung:
- [DATA_MIGRATION.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/DATA_MIGRATION.md)
- [UAT_CHECKLIST.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/UAT_CHECKLIST.md)

## Target Topologi

- Ubuntu 22.04 / 24.04
- backend Go sebagai binary tunggal
- frontend React dibuild menjadi static assets
- SQLite sebagai database file
- `systemd` untuk API dan worker
- reverse proxy: Nginx

## Struktur Direktori yang Disarankan

```text
/opt/menettech-go/
  /backend
    menettech-go
    .env
  /frontend-dist
  /storage
    dashboard.db
    /uploads
    /backups
```

## Environment Minimal

Gunakan [backend/.env.example](/D:/xampp/htdocs/Dashboard/backend/.env.example) sebagai template awal.

Poin penting:
- `APP_ENV=production`
- `HTTP_ADDR=127.0.0.1:8080`
- `SQLITE_PATH=/opt/menettech-go/storage/dashboard.db`
- `STORAGE_PATH=/opt/menettech-go/storage`
- `SESSION_COOKIE_SECURE=true`
- ganti `BOOTSTRAP_ADMIN_PASSWORD`

## Build

### Backend

```bash
cd backend
go build -o menettech-go ./cmd/api
```

### Frontend

```bash
cd frontend
npm ci
npm run build
```

Lalu taruh hasil `frontend/dist` ke direktori static yang akan diserve oleh Nginx.

### Build + package sekali jalan

Script helper tersedia di:
- [deploy/go-dev/release.sh](/D:/xampp/htdocs/Dashboard/deploy/go-dev/release.sh)

Menjalankan script ini akan:
1. `go test ./...`
2. build binary backend
3. build frontend production
4. pack `frontend/dist`
5. menghasilkan `SHA256SUMS.txt`

```bash
chmod +x deploy/go-dev/release.sh
./deploy/go-dev/release.sh
```

## Systemd

Template unit file tersedia di:
- [deploy/go-dev/menettech-go-api.service](/D:/xampp/htdocs/Dashboard/deploy/go-dev/menettech-go-api.service)
- [deploy/go-dev/menettech-go-worker.service](/D:/xampp/htdocs/Dashboard/deploy/go-dev/menettech-go-worker.service)

Aktivasi:

```bash
sudo cp deploy/go-dev/menettech-go-api.service /etc/systemd/system/
sudo cp deploy/go-dev/menettech-go-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now menettech-go-api
sudo systemctl enable --now menettech-go-worker
```

## Health Checks

Endpoint:
- `/livez`
- `/readyz`
- `/health`

Gunakan:
- `livez` untuk process liveness
- `readyz` untuk database readiness
- `health` untuk observability yang lebih kaya

Smoke test endpoint tersedia:
- [deploy/go-dev/smoke.sh](/D:/xampp/htdocs/Dashboard/deploy/go-dev/smoke.sh)

```bash
chmod +x deploy/go-dev/smoke.sh
./deploy/go-dev/smoke.sh http://127.0.0.1:8080
```

## Worker Safety

Worker sekarang memakai lease lock di database settings agar tidak mudah berjalan ganda pada node yang sama.

Key yang relevan:
- `worker_interval_seconds`
- `worker_lock_ttl_seconds`

## Data Migration (Legacy PHP/MySQL -> Go/SQLite)

Mode import disediakan sebagai subcommand backend:

```bash
cd backend
LEGACY_MYSQL_DSN="user:pass@tcp(127.0.0.1:3306)/dashboard?parseTime=true&charset=utf8mb4" \
IMPORT_DRY_RUN=true \
go run ./cmd/api import
```

Jika hasil dry-run sudah benar, jalankan impor nyata:

```bash
cd backend
LEGACY_MYSQL_DSN="user:pass@tcp(127.0.0.1:3306)/dashboard?parseTime=true&charset=utf8mb4" \
IMPORT_DRY_RUN=false \
go run ./cmd/api import
```

Catatan:
- importer bersifat **upsert idempotent** untuk tabel inti (`paket`, `pelanggan`, `template_wa`, `pengaturan`, `tagihan`)
- output berupa JSON ringkas (`read`, `upserted`, `skipped`, `errors`) per tabel
- jalankan pada maintenance window untuk menghindari drift data saat cutover

## Restore Drill Minimum

Checklist backup yang sehat:
1. Buat backup dari dashboard / API
2. Jalankan `Verify` dari tab Monitoring
3. Simpan satu file backup ke lokasi terpisah
4. Uji restore manual ke file SQLite sementara di staging

## Go-Live Checklist

1. Build backend dan frontend dari commit yang akan dirilis
2. Ganti password bootstrap admin
3. Pastikan folder storage writable oleh service user
4. Pastikan `SESSION_COOKIE_SECURE=true`
5. Jalankan `go test ./...`
6. Jalankan `npm run build`
7. Cek `/livez`, `/readyz`, `/health`
8. Login sebagai admin
9. Buat backup dan verify
10. Jalankan worker dan cek heartbeat
11. Uji login petugas
12. Uji generate tagihan dan pelunasan satu skenario penuh
13. Jalankan `./deploy/go-dev/smoke.sh`
14. Pastikan `/health` tidak memiliki alert kritikal (database/worker error)

## Incident Runbook Ringkas

### 1) Worker stale / heartbeat terlambat
- cek status: `systemctl status menettech-go-worker`
- lihat log: `journalctl -u menettech-go-worker -n 200 --no-pager`
- verifikasi lock setting (`worker_lock_owner` dan `worker_lock_until`) jika perlu
- restart aman: `sudo systemctl restart menettech-go-worker`

### 2) Auto backup tidak berjalan
- cek `backup_auto_enabled`, `backup_auto_time`, `backup_retention_count`
- cek folder writable: `/opt/menettech-go/storage/backups`
- jalankan backup manual dari dashboard, lalu `Verify`

### 3) Integrasi WA/Discord/MikroTik pending
- pastikan konfigurasi di tab Pengaturan sudah lengkap
- cek `/health` bagian `integrations` dan `alerts`
- uji skenario kirim notifikasi sederhana dari alur tagihan/worker
