# FEATURE_SPEC.md — Menet-Tech Dashboard (go-dev)

Dokumen ini adalah spesifikasi fitur lengkap yang harus diimplementasikan agar sistem siap production.
Setiap fitur dilengkapi dengan gambaran teknis, kontrak API, behaviour yang diharapkan, dan requirement test minimal **80% coverage**.

---

## PANDUAN UNTUK AI AGENT

- Stack: Go backend (chi router), React + TypeScript frontend (Vite), SQLite (mattn/go-sqlite3)
- Pola arsitektur: `handler → service → repository`
- Semua handler baru harus didaftarkan di `backend/internal/http/router/router.go`
- Semua route protected wajib pakai middleware `authMiddleware` dan `csrfMiddleware`
- Setiap fitur backend **wajib** ada file `*_test.go` dengan coverage minimal 80%
- Frontend state dikelola di `frontend/src/App.tsx` (monolith sementara) — fitur baru bisa mulai dipecah ke komponen di `frontend/src/components/`
- Style menggunakan CSS vanilla di `frontend/src/styles.css`
- Jalankan `cd backend && go test ./...` setelah setiap perubahan backend
- Jalankan `cd frontend && npm run build` setelah setiap perubahan frontend

---

## FITUR 1 — Filter & Search Tagihan

### Tujuan
Operator perlu bisa menyaring daftar tagihan berdasarkan nama pelanggan, status, dan periode tanpa scroll panjang.

### Backend

**Endpoint yang dimodifikasi:** `GET /api/v1/bills`

Tambah query parameter opsional:
- `?status=belum_bayar|lunas` — filter by DB status
- `?period=2026-04` — filter by periode YYYY-MM
- `?customer_id=123` — filter by pelanggan
- `?q=nama` — full-text search nama pelanggan (LIKE %q%)
- `?page=1&limit=50` — paginasi (default limit 50)

Response tambahan:
```json
{
  "data": [...],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 50,
    "total_pages": 3
  }
}
```

**File yang dimodifikasi:**
- `backend/internal/billing/service.go` — tambah method `ListWithFilter(ctx, ListFilter)`
- `backend/internal/http/handler/bills.go` — parse query params, teruskan ke service

**Test wajib (`backend/internal/billing/filter_test.go`):**
- Filter by status `lunas` hanya mengembalikan tagihan lunas
- Filter by `period` hanya mengembalikan tagihan periode tersebut
- Search `q` menemukan pelanggan yang namanya mengandung query
- Paginasi: `page=2&limit=2` mengembalikan item yang benar
- Filter kosong mengembalikan semua tagihan

### Frontend

Di tab Tagihan, tambah bar filter di atas tabel:
- Input teks search nama pelanggan (debounce 300ms)
- Dropdown status: Semua / Belum Bayar / Lunas / Jatuh Tempo / Menunggak
- Input periode (month picker, format YYYY-MM)
- Tombol Reset Filter

Filter client-side untuk display status (`jatuh_tempo`, `menunggak`) karena status ini computed — filter harus terjadi di frontend setelah data diterima.

---

## FITUR 2 — Halaman Detail Pelanggan

### Tujuan
Operator perlu lihat riwayat tagihan dan informasi lengkap satu pelanggan tanpa harus cari di tabel utama.

### Backend

**Endpoint baru:** `GET /api/v1/customers/{id}`

Response:
```json
{
  "data": {
    "id": 1,
    "name": "Budi Santoso",
    "package_id": 2,
    "package_name": "Paket 20 Mbps",
    "package_speed": 20,
    "user_pppoe": "budi",
    "whatsapp": "6281234567890",
    "address": "Jl. Merdeka No. 1",
    "due_day": 8,
    "status": "active",
    "sn_ont": "ABC123",
    "created_at": "2026-01-01T00:00:00Z",
    "bills": [
      {
        "id": 10,
        "period": "2026-04",
        "invoice_number": "08-04-2026/1/20/001",
        "amount": 150000,
        "due_date": "2026-04-08",
        "status": "lunas",
        "display_status": "lunas",
        "paid_at": "2026-04-05T10:00:00Z",
        "payment_method": "transfer"
      }
    ],
    "total_bills": 5,
    "total_unpaid": 0
  }
}
```

**File baru/modifikasi:**
- `backend/internal/customers/service.go` — tambah `FindByID(ctx, id)`
- `backend/internal/http/handler/customers.go` — tambah handler `Show`
- `backend/internal/http/router/router.go` — daftarkan `GET /api/v1/customers/{id}`

**Test wajib (`backend/internal/customers/service_test.go`):**
- `FindByID` pelanggan yang ada → data lengkap + bills
- `FindByID` pelanggan tidak ada → `ErrCustomerNotFound`
- Response menyertakan hitungan `total_unpaid` yang benar

### Frontend

Tambah view baru `customer_detail` yang dibuka saat klik nama pelanggan di tabel.
Tampilkan:
- Card info pelanggan (nama, paket, WA, alamat, jatuh tempo, status)
- Tabel riwayat tagihan pelanggan (sortir terbaru dulu)
- Tombol kembali ke daftar pelanggan

---

## FITUR 3 — Kirim WA Manual per Tagihan

### Tujuan
Operator perlu bisa trigger notifikasi WA secara manual untuk satu tagihan tertentu (reminder, jatuh tempo, lunas) tanpa harus tunggu worker.

### Backend

**Endpoint baru:** `POST /api/v1/bills/{id}/notify`

Request body:
```json
{
  "trigger_key": "reminder_custom"
}
```

Valid trigger keys: `reminder_custom`, `jatuh_tempo`, `limit_5hari`, `lunas`

Response:
```json
{
  "data": {
    "sent": true,
    "trigger_key": "reminder_custom",
    "phone": "6281234567890"
  }
}
```

Jika WA gateway error, endpoint tetap return 200 tapi `sent: false` + `error_message`.
Log notifikasi disimpan ke tabel `notification_logs` sama seperti pengiriman otomatis.

**File baru/modifikasi:**
- `backend/internal/billing/service.go` — tambah `SendManualNotification(ctx, billID, triggerKey, userID)`
- `backend/internal/http/handler/bills.go` — tambah handler `Notify`
- `backend/internal/http/router/router.go` — daftarkan route

**Test wajib (`backend/internal/billing/notify_test.go`):**
- Trigger key valid → WA sender dipanggil dengan payload yang benar
- Trigger key tidak valid → return error validasi
- Bill tidak ditemukan → return `ErrBillNotFound`
- WA sender error → return `sent: false`, tidak panic
- Log disimpan ke `notification_logs` setelah pengiriman

### Frontend

Di tabel tagihan, tambah menu dropdown aksi per baris:
- "Kirim Reminder"
- "Kirim Notif Jatuh Tempo"
- "Kirim Notif Limit"
- "Kirim Notif Lunas" (hanya jika status lunas)

Konfirmasi sebelum kirim. Tampilkan hasil (berhasil/gagal + nomor tujuan).

---

## FITUR 4 — Export Laporan CSV

### Tujuan
Operator butuh rekonsiliasi bulanan. Export daftar tagihan dan pelanggan ke CSV untuk dibuka di Excel.

### Backend

**Endpoint baru:** `GET /api/v1/reports/bills.csv`

Query params opsional (sama dengan filter tagihan):
- `?period=2026-04`
- `?status=lunas`

Response: file CSV dengan header `Content-Disposition: attachment; filename="tagihan-2026-04.csv"` dan `Content-Type: text/csv`.

Kolom CSV:
```
No Invoice, Nama Pelanggan, Paket, Kecepatan, Periode, Jatuh Tempo, Nominal, Status, Tanggal Bayar, Metode Bayar
```

**Endpoint baru kedua:** `GET /api/v1/reports/customers.csv`

Kolom CSV:
```
ID, Nama, Paket, Kecepatan, WA, Alamat, Hari Jatuh Tempo, Status, Tanggal Daftar
```

**File baru:**
- `backend/internal/http/handler/reports.go`
- `backend/internal/http/router/router.go` — daftarkan routes

**Test wajib (`backend/internal/http/handler/reports_test.go`):**
- Response punya header `Content-Type: text/csv`
- Baris pertama CSV adalah header kolom yang benar
- Filter period bekerja — hanya tagihan periode itu yang diekspor
- File kosong (tidak ada data) tetap mengembalikan header CSV valid

### Frontend

Di tab Tagihan, tambah tombol "Export CSV" di sebelah Generate. Saat diklik, buka URL download langsung. Di tab Pelanggan, tambah tombol "Export CSV Pelanggan".

---

## FITUR 5 — Dashboard Summary yang Lebih Kaya

### Tujuan
Dashboard saat ini hanya menampilkan 4 angka. Operator butuh gambaran lebih lengkap.

### Backend

**Endpoint yang dimodifikasi:** `GET /api/v1/dashboard/summary`

Tambahkan field baru ke response:
```json
{
  "total_pelanggan": 50,
  "total_active": 45,
  "total_limit": 3,
  "total_inactive": 2,
  "total_tagihan_belum_bayar": 12,
  "total_tagihan_lunas_bulan_ini": 38,
  "total_pendapatan_bulan_ini": 5700000,
  "total_tagihan_jatuh_tempo": 5,
  "total_tagihan_menunggak": 2,
  "recent_payments": [
    {
      "customer_name": "Budi",
      "invoice_number": "...",
      "amount": 150000,
      "paid_at": "2026-04-20T10:00:00Z"
    }
  ]
}
```

`recent_payments` adalah 5 pembayaran terakhir.

**File modifikasi:**
- `backend/internal/http/handler/dashboard.go`
- Query SQL diperluas untuk menghitung semua field baru

**Test wajib (`backend/internal/http/handler/dashboard_test.go`):**
- Semua field hadir di response
- `total_pendapatan_bulan_ini` sesuai sum tagihan lunas bulan ini
- `recent_payments` maksimal 5 item, diurutkan terbaru dulu

### Frontend

Dashboard view diperbarui:
- Stats grid 6 kartu (tambah Jatuh Tempo, Menunggak, Pendapatan Bulan Ini)
- Tabel "Pembayaran Terbaru" (5 baris, klik nama → detail pelanggan)
- Format currency IDR untuk nominal

---

## FITUR 6 — MikroTik Integration (Real RouterOS API)

### Tujuan
Pelanggan yang sudah `limit` harus benar-benar terputus/dikurangi bandwidth di router MikroTik.

### Backend

**Package baru:** `backend/internal/mikrotik/`

File: `backend/internal/mikrotik/client.go`

```go
type Client struct {
    Host     string
    Username string
    Password string
}

type ClientInterface interface {
    LimitUser(ctx context.Context, pppoeUser string) error
    UnlimitUser(ctx context.Context, pppoeUser string) error
    TestConnection(ctx context.Context) error
    GetUserStatus(ctx context.Context, pppoeUser string) (UserStatus, error)
}
```

Implementasi menggunakan library `github.com/go-routeros/routeros/v3` (RouterOS API over TCP port 8728/8729).

`LimitUser`: tambah atau update Simple Queue untuk username PPPoE dengan max-limit yang dikonfigurasi (setting key `mikrotik_limit_upload`/`mikrotik_limit_download`, default `1M/1M`).

`UnlimitUser`: hapus Simple Queue untuk username PPPoE tersebut (restore ke kecepatan paket normal).

**Settings keys baru:**
- `mikrotik_limit_upload` — default `1M`
- `mikrotik_limit_download` — default `1M`

**Integrasi ke worker:**
Di `backend/internal/worker/worker.go`, saat `ProcessAutomation` mendeteksi pelanggan melewati `LimitDays`, panggil `MikroTikClient.LimitUser(pppoeUser)` setelah update status di DB. Jika MikroTik error, log warning tapi jangan gagalkan keseluruhan worker cycle.

Saat `MarkPaid` dan pelanggan kembali ke `active`, panggil `MikroTikClient.UnlimitUser(pppoeUser)`.

**Endpoint test:** `POST /api/v1/settings/test-mikrotik`

Response:
```json
{
  "data": {
    "connected": true,
    "message": "RouterOS 6.49.7 — connection OK",
    "test_user_status": "active"
  }
}
```

**Test wajib (`backend/internal/mikrotik/client_test.go`):**
- Gunakan `ClientInterface` mock — test tidak boleh membutuhkan router nyata
- `LimitUser` dengan mock → perintah API yang benar dikirim
- `UnlimitUser` dengan mock → perintah API yang benar dikirim
- Koneksi gagal → return error yang deskriptif
- `TestConnection` dengan credentials kosong → return error validasi

### Frontend

Di tab Pengaturan, tombol "Test MikroTik" diperbarui agar memanggil endpoint `/settings/test-mikrotik` dan menampilkan hasilnya (connected/error + pesan detail).

---

## FITUR 7 — Discord Notification per Event (Go Layer)

### Tujuan
Discord bot lama ada di Node.js (legacy). Untuk go-dev, Discord webhook sudah ada tapi belum semua event dikonfigurasi dari UI dengan lengkap.

### Backend

**Setting keys baru yang perlu didaftarkan:**
- `discord_notify_generate` — default `true`
- `discord_notify_payment` — default `true`
- `discord_notify_limit` — default `true`
- `discord_notify_reminder` — default `false`
- `discord_notify_worker_error` — default `true`
- `discord_alert_url` — URL webhook channel alert
- `discord_billing_url` — URL webhook channel billing

`notifications.DiscordService.IsEventEnabled(ctx, key)` sudah ada — pastikan semua event baru mengecek key ini.

**Event yang harus mengirim Discord notification:**
1. Generate tagihan → billing channel
2. Mark paid → billing channel
3. Pelanggan dilimit (worker) → alert channel
4. Worker error (panic/recovery) → alert channel
5. Backup gagal → alert channel
6. WA gateway unreachable (dari worker) → alert channel

Format pesan Discord selalu: emoji + **bold label** + detail.

**Test wajib (`backend/internal/notifications/discord_test.go`):**
- `IsEventEnabled` → false jika key kosong atau `false`
- `IsEventEnabled` → true jika key `true`
- `SendAlert` dengan URL kosong → tidak error, skip silently
- Setiap event baru punya test yang memverifikasi Discord dipanggil saat event terjadi

### Frontend

Di tab Pengaturan, tambah section "Notifikasi Discord" dengan toggle on/off untuk setiap event di atas.

---

## FITUR 8 — WA Notification Retry

### Tujuan
Jika WA gateway sedang down saat notifikasi dikirim, pesan tidak boleh hilang begitu saja.

### Backend

**Migration baru:** `backend/internal/platform/migrate/sql/0005_wa_retry.sql`
```sql
ALTER TABLE notification_logs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_logs ADD COLUMN next_retry_at DATETIME;
ALTER TABLE notification_logs ADD COLUMN last_error TEXT;
```

**Behaviour retry:**
- Jika pengiriman WA gagal, update `notification_logs` dengan `status=error`, `last_error=<pesan>`, `retry_count=1`, `next_retry_at=NOW()+5min`
- Worker menjalankan `RetryFailedNotifications()` setiap interval
- Retry maksimal 3 kali (`retry_count <= 3`)
- Backoff: retry ke-1 = 5 menit, ke-2 = 30 menit, ke-3 = 2 jam
- Setelah 3 kali gagal, `status=failed_permanent`

**Method baru:**
- `notifications.NotificationLogRepository.PendingRetries(ctx) ([]NotificationLog, error)`
- `notifications.WhatsAppService.Retry(ctx, log NotificationLog) error`
- `worker.Worker.retryFailedNotifications(ctx)`

**Test wajib (`backend/internal/notifications/retry_test.go`):**
- Notifikasi gagal → `retry_count` bertambah, `next_retry_at` diset
- Setelah 3 gagal → status `failed_permanent`, tidak retry lagi
- `PendingRetries` hanya mengembalikan log yang `next_retry_at <= NOW()`
- Retry berhasil → status berubah ke `sent`, `retry_count` tidak berubah

---

## FITUR 9 — UI/UX Improvements

### 9.1 — Konfirmasi Dialog

**Masalah saat ini:** Tombol "Tandai Lunas", "Hapus Paket", "Hapus Template", "Reset Password" tidak ada konfirmasi → mudah misclick.

**Implementasi:**
- Buat komponen `ConfirmDialog` di `frontend/src/components/ConfirmDialog.tsx`
- Props: `title`, `message`, `onConfirm`, `onCancel`, `confirmLabel`, `confirmTone` (danger/primary)
- Gunakan native `<dialog>` HTML element
- Semua aksi destruktif wajib melalui `ConfirmDialog`

### 9.2 — Toast Notification

**Masalah saat ini:** Message/error ditampilkan sebagai teks statis di atas halaman → tidak mencolok, tidak auto-dismiss.

**Implementasi:**
- Buat komponen `ToastContainer` + `Toast` di `frontend/src/components/Toast.tsx`
- Toast auto-dismiss setelah 4 detik
- Tipe: `success` (hijau), `error` (merah), `info` (biru)
- Posisi: kanan bawah layar
- Stack multiple toast

### 9.3 — Loading Skeleton

**Masalah saat ini:** Saat data dimuat, tabel kosong tanpa indikator.

**Implementasi:**
- Buat komponen `SkeletonRow` di `frontend/src/components/Skeleton.tsx`
- Tampilkan 5 baris skeleton saat `isLoading` sebelum data datang

### 9.4 — Tabel Responsif + Sort Kolom

Semua tabel harus:
- Bisa scroll horizontal di mobile
- Klik header kolom → sort asc/desc (implementasi client-side)
- Menampilkan teks "Tidak ada data" saat tabel kosong (bukan tabel kosong)

### 9.5 — Format Angka & Tanggal Konsisten

- Semua nominal tampil dalam format IDR: `Rp 150.000`
- Semua tanggal tampil dalam format Indonesia: `8 April 2026`
- Waktu relatif untuk `paid_at` dan `created_at`: `2 jam lalu`, `3 hari lalu`

Buat utility di `frontend/src/lib/format.ts`:
```ts
export function formatIDR(amount: number): string
export function formatDate(isoString: string): string
export function formatRelativeTime(isoString: string): string
```

**Test wajib (`frontend/src/lib/format.test.ts` — menggunakan Vitest):**
- `formatIDR(150000)` → `"Rp 150.000"`
- `formatDate("2026-04-08T00:00:00Z")` → mengandung `April` dan `2026`
- `formatRelativeTime` → return string yang tidak kosong untuk input valid

---

## FITUR 10 — Structured Logging Backend

### Tujuan
Log production harus machine-readable dan mudah di-grep/filter.

### Backend

Go sudah pakai `log/slog` — perlu distandarkan penggunaannya.

**Standar log yang harus dipastikan:**
- Setiap request HTTP: method, path, status, latency, request_id (sudah via chi middleware)
- Setiap error di service/repository: log dengan `slog.Error` + `"err"` key + konteks request
- Worker cycle start/stop: log dengan `slog.Info`
- Notifikasi WA terkirim/gagal: log dengan `slog.Info`/`slog.Warn`
- Backup dibuat/gagal: log dengan `slog.Info`/`slog.Error`

**Format production:**
- Saat `APP_ENV=production` → format JSON (`slog.NewJSONHandler`)
- Saat `APP_ENV=development` → format text (sudah default)

**Modifikasi di:** `backend/cmd/api/main.go` — inisialisasi logger sesuai `APP_ENV`.

**Test wajib (`backend/internal/config/logging_test.go`):**
- `APP_ENV=production` → logger handler adalah JSON handler
- `APP_ENV=development` → logger handler adalah text handler

---

## FITUR 11 — Rate Limiting per Endpoint

### Tujuan
Saat ini hanya login yang di-rate-limit. Endpoint mutasi lain perlu perlindungan.

### Backend

Tambah middleware rate limit berbasis IP di `backend/internal/http/router/middleware.go`.

Gunakan sliding window in-memory (tidak perlu Redis) dengan `sync.Map`:
- Global: max 120 request/menit per IP untuk semua endpoint protected
- Generate tagihan: max 10/menit per IP
- Upload proof: max 20/menit per IP

Saat limit tercapai → response 429 dengan header `Retry-After`.

**Test wajib (`backend/internal/http/router/middleware_test.go`):**
- Request ke-121 dalam satu menit → 429
- Request setelah window berlalu → kembali normal
- IP berbeda → limit independen

---

## FITUR 12 — Frontend Test Suite (Vitest)

### Tujuan
Saat ini frontend tidak punya test sama sekali. Target coverage minimal 80% untuk `lib/` dan utility.

### Setup

```bash
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/user-event jsdom
```

Tambah ke `frontend/vite.config.ts`:
```ts
test: {
  environment: 'jsdom',
  globals: true,
}
```

### Test yang harus dibuat:

**`frontend/src/lib/api.test.ts`:**
- `login` dengan credentials valid → return user object
- `login` gagal → throw `ApiError` dengan status 401
- `generateBills` → memanggil endpoint yang benar dengan period yang benar
- `markBillPaid` → memanggil endpoint yang benar

**`frontend/src/lib/format.test.ts`:**
- Semua fungsi format (lihat Fitur 9.5)

**`frontend/src/components/StatusPill.test.tsx`:**
- Render dengan tone `success` → class yang benar
- Render dengan tone `danger` → class yang benar
- Label tampil di DOM

**`frontend/src/components/ConfirmDialog.test.tsx`** (setelah Fitur 9.1):
- `onConfirm` dipanggil saat tombol konfirmasi diklik
- `onCancel` dipanggil saat tombol batal diklik

---

## FITUR 13 — Security Hardening Tambahan

### 13.1 — Upload File Validation

**Masalah:** Upload bukti bayar saat ini hanya check ukuran file, belum validasi MIME type.

**Fix di** `backend/internal/http/handler/bills.go`:
- Baca 512 byte pertama file dan deteksi MIME dengan `http.DetectContentType`
- Whitelist: `image/jpeg`, `image/png`, `application/pdf`
- Max size: 5 MB
- Simpan file dengan nama acak (`uuid.New().String() + ext`), jangan pakai nama asli dari client

**Test wajib:**
- Upload file JPEG valid → 200 OK
- Upload file EXE → 400 Bad Request
- Upload file > 5 MB → 400 Bad Request

### 13.2 — Sensitive Data di Log

- Pastikan `password`, `api_key`, `wa_api_key` tidak pernah masuk ke log
- Review semua `slog.Info`/`slog.Error` call yang mungkin log struct settings

### 13.3 — Security Headers

Tambah middleware di router untuk set header:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

**Test wajib:**
- Response dari semua endpoint mengandung header `X-Content-Type-Options`

---

## FITUR 14 — Monitoring: Worker Status History

### Tujuan
Saat ini monitoring hanya menampilkan heartbeat terakhir. Operator butuh tahu apakah worker pernah mati dan kapan.

### Backend

**Migration baru:** `backend/internal/platform/migrate/sql/0006_worker_history.sql`
```sql
CREATE TABLE IF NOT EXISTS worker_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,  -- 'start', 'stop', 'error', 'cycle_ok'
  message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Worker mencatat event:
- `start` saat pertama kali jalan
- `cycle_ok` setiap siklus sukses (tapi hanya simpan per jam agar tidak flood)
- `error` saat ada panic atau error fatal di cycle
- `stop` saat menerima SIGTERM

**Endpoint baru:** `GET /api/v1/worker/events?limit=50`

**Test wajib:**
- Worker start → event `start` tersimpan
- Cycle error → event `error` tersimpan dengan pesan error
- `GET /api/v1/worker/events` → return list event

### Frontend

Di tab Monitoring, tambah section "Worker Event Log" dengan tabel events (waktu, tipe, pesan). Tipe `error` ditampilkan dengan warna merah.

---

## CHECKLIST COVERAGE

Setelah semua fitur diimplementasikan, jalankan:

```bash
cd backend && go test ./... -coverprofile=coverage.out && go tool cover -func=coverage.out
```

Target: **tidak ada package di bawah 80%** kecuali `main` dan generated code.

```bash
cd frontend && npx vitest run --coverage
```

Target: **coverage statements ≥ 80%** untuk semua file di `src/lib/` dan `src/components/`.

---

## URUTAN IMPLEMENTASI YANG DISARANKAN

Urutan ini meminimalkan konflik dan memastikan setiap fitur bisa langsung ditest:

1. **Fitur 9.5** — `format.ts` utilities (tidak ada dependency)
2. **Fitur 12** — Setup Vitest + test `format.ts`
3. **Fitur 9.1** — `ConfirmDialog` component
4. **Fitur 9.2** — `Toast` component
5. **Fitur 9.3** — `Skeleton` component
6. **Fitur 5** — Dashboard summary diperkaya (backend + frontend)
7. **Fitur 1** — Filter tagihan (backend + frontend)
8. **Fitur 2** — Detail pelanggan (backend + frontend)
9. **Fitur 3** — Kirim WA manual (backend + frontend)
10. **Fitur 4** — Export CSV
11. **Fitur 7** — Discord events lengkap
12. **Fitur 8** — WA retry
13. **Fitur 6** — MikroTik real integration
14. **Fitur 10** — Structured logging
15. **Fitur 11** — Rate limiting
16. **Fitur 13** — Security hardening
17. **Fitur 14** — Worker event history
18. **Fitur 9.4** — Tabel sort/responsif (polish terakhir)

---

## CATATAN PENTING

- Jangan ubah schema kolom yang sudah ada di migration sebelumnya — selalu pakai file migration baru dengan nomor urut berikutnya
- Semua migration harus idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- Semua endpoint baru yang membutuhkan auth harus ikut middleware yang sudah ada di router — jangan skip
- Saat menambah setting key baru, selalu tambahkan ke seed di migration terkait agar nilai default ada
- Jangan hardcode credential, URL, atau secret apapun di kode — selalu baca dari settings atau config env
