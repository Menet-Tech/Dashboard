# Current Progress

Dokumen ini mencatat status pengerjaan terakhir agar AI agent lain bisa melanjutkan tanpa harus audit ulang seluruh repo.

## Tujuan Besar Yang Sedang Dikerjakan

Paket pekerjaan yang sedang diimplementasikan:
- otomasi tagihan bulanan yang lebih lengkap
- histori pembayaran + metode bayar + bukti bayar + audit operator
- integrasi MikroTik real
- monitoring dan observability
- laporan operasional + export
- role/permission + audit
- backup dan hardening keamanan

## Yang Sudah Selesai Sebelumnya

- Dashboard web native PHP MVC sudah berjalan
- pelanggan menggunakan konsep jatuh tempo bulanan berbasis angka tanggal
- tagihan bisa di-generate manual
- detail pelanggan sudah ada
- Discord webhook + bot dasar sudah ada
- tombol test WA / Discord / MikroTik sudah ada
- AGENTS.md sudah ada

## Progress Turn Sebelumnya (turn ke-2)

1. Menambah fondasi schema extension:
   - file migration dibuat di [database/migrations/20260409_production_upgrade.sql](/D:/xampp/htdocs/Dashboard/database/migrations/20260409_production_upgrade.sql)
   - runner migration dibuat di [database/migrate.php](/D:/xampp/htdocs/Dashboard/database/migrate.php)

2. Model baru ditambahkan:
   - [app/Models/LoginAttempt.php](/D:/xampp/htdocs/Dashboard/app/Models/LoginAttempt.php)
   - [app/Models/PaymentHistory.php](/D:/xampp/htdocs/Dashboard/app/Models/PaymentHistory.php)
   - [app/Models/SystemHealthCheck.php](/D:/xampp/htdocs/Dashboard/app/Models/SystemHealthCheck.php)
   - [app/Models/BackupLog.php](/D:/xampp/htdocs/Dashboard/app/Models/BackupLog.php)
   - [app/Models/Report.php](/D:/xampp/htdocs/Dashboard/app/Models/Report.php)

4. **Sidebar Clock**:
   - Menambahkan fitur jam dan tanggal live di sidebar untuk estetika premium dan kemudahan operasional.
   - Perubahan di: `sidebar.php`, `app.css`, dan `app.js`.

5. **Fondasi auth/security sudah mulai diikat**:
   - login rate limiting memakai `login_attempts`
   - login/logout dicatat ke `action_log`

4. Fondasi role restriction mulai ditambahkan:
   - ada helper `requireAdmin()`

5. Fondasi payment workflow mulai diubah:
   - sudah ada `registerPayment()` dan `latestUnpaid()`

6. Routing awal untuk modul baru sudah ditambahkan:
   - `/tagihan/show`, `/tagihan/pay`, `/laporan`, `/laporan/export`, `/monitoring`, `/backup`, `/backup/create`

7. Modul tambahan sekarang sudah dibuat:
   - ReportController, MonitoringController, BackupController, UserController

8. View tambahan sudah dibuat:
   - tagihan/show, laporan/index, monitoring/index, backup/index, users/index

9. Payment workflow sekarang sudah mulai lengkap dengan detail + histori + upload bukti bayar

10. Monitoring & backup dasar sudah ada

11. MikroTik stub sudah diganti dengan client RouterOS API real berbasis socket

## Progress Turn Ini (turn ke-3) — Bug Fix & Feature Improvement

### Bug yang diperbaiki

1. **Bug WA template** — tombol `WA Me` dan `WA Gateway` di halaman tagihan selalu
   memakai template `jatuh_tempo` meskipun tagihan sudah `lunas`.
   - Fix di: [app/Views/tagihan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/index.php)
   - Sekarang trigger dipilih berdasarkan `$row['status']`:
     - `lunas` → trigger `lunas`
     - `belum_bayar` → trigger `jatuh_tempo`

2. **Status badge tagihan** tidak menampilkan label yang lengkap (tidak ada "Jatuh Tempo" / "Menunggak").
   - Fix di: [app/Models/Tagihan.php](/D:/xampp/htdocs/Dashboard/app/Models/Tagihan.php) + view

### Fitur baru

3. **Computed display status** di Tagihan:
   - Method baru: `computeDisplayStatus(array $row): string`
   - Method baru: `displayStatusBadge(string $displayStatus): string`
   - Method baru: `displayStatusLabel(string $displayStatus): string`
   - Method baru: `countUnpaidForCustomer(int $pelangganId): int`
   - Logika:
     - `belum_bayar` + jatuh tempo belum lewat → **Belum Bayar** (badge secondary)
     - `belum_bayar` + jatuh tempo sudah lewat + 1 tagihan belum bayar → **Jatuh Tempo** (badge warning)
     - `belum_bayar` + jatuh tempo sudah lewat + 2+ tagihan belum bayar → **Menunggak** (badge danger)
     - `lunas` → **Lunas** (badge success)
   - Query `all()` sekarang menyertakan subquery `total_unpaid_count` per pelanggan

4. **Status pelanggan otomatis kembali ke `active`** setelah pelunasan:
   - Fix di: [app/Controllers/TagihanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/TagihanController.php)
   - Helper baru: `restorePelangganStatusIfPaid(int $pelangganId, Tagihan $model): void`
   - Dipanggil di `markPaid()` dan `pay()`
   - Jika tidak ada tagihan belum bayar → status pelanggan dikembalikan ke `active`
   - Jika masih ada tunggakan lain → status pelanggan tetap `limit`

5. **Log dashboard lebih detail & scrollable**:
   - Model: [app/Models/ActionLog.php](/D:/xampp/htdocs/Dashboard/app/Models/ActionLog.php) — `latest()` sekarang JOIN ke tabel `pelanggan`
   - View: [app/Views/dashboard/index.php](/D:/xampp/htdocs/Dashboard/app/Views/dashboard/index.php) — tampilkan nama pelanggan, label aksi dalam Bahasa Indonesia, badge status berwarna, pesan detail, waktu relatif
   - CSS: [public/assets/css/app.css](/D:/xampp/htdocs/Dashboard/public/assets/css/app.css) — `.log-list` sekarang scrollable (`max-height: 420px; overflow-y: auto`)
   - Limit log dinaikkan dari 10 ke 20

6. **Unit test** sekarang ada 30 test, 46 assertions, semua pass:
   - Test baru: [tests/Unit/TagihanStatusTest.php](/D:/xampp/htdocs/Dashboard/tests/Unit/TagihanStatusTest.php) — 11 test
   - Test diupdate: [tests/Unit/TemplateWATest.php](/D:/xampp/htdocs/Dashboard/tests/Unit/TemplateWATest.php) — 3 test tambahan
   - Test diupdate: [tests/Unit/PelangganDueDateTest.php](/D:/xampp/htdocs/Dashboard/tests/Unit/PelangganDueDateTest.php) — 7 test tambahan

### Belum selesai / masih pending

1. Belum ada smoke test fungsional end-to-end untuk:
   - bayar tagihan + upload bukti
   - backup database
   - koneksi MikroTik real ke router aktif

2. Export laporan saat ini masih CSV untuk kompatibilitas Excel.
   - PDF native belum dibuat

3. User management masih dasar.
   - belum ada edit/nonaktifkan/reset password dari UI

4. Monitoring Discord bot mengandalkan heartbeat dari process bot ke database.
   - perlu diuji setelah bot dijalankan

5. Perlu uji manual semua route baru di browser

6. Perlu verifikasi `mysqldump` di environment target

## Progress Turn Ini (turn ke-4) - Performance, Discord Routing, Invoice

1. **Performa dashboard dan monitoring ditingkatkan**
   - bottleneck utama sebelumnya berasal dari health check WA Gateway dan MikroTik yang selalu dipanggil live saat halaman dibuka
   - dashboard dan monitoring sekarang membaca status cache terakhir dari pengaturan + `system_health_checks`
   - monitoring sekarang punya refresh manual live di route `/monitoring/refresh`
   - file utama:
     - [app/Controllers/DashboardController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/DashboardController.php)
     - [app/Controllers/MonitoringController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/MonitoringController.php)
     - [app/Models/SystemHealthCheck.php](/D:/xampp/htdocs/Dashboard/app/Models/SystemHealthCheck.php)
     - [app/Models/MikroTikAPI.php](/D:/xampp/htdocs/Dashboard/app/Models/MikroTikAPI.php)

2. **Discord webhook sekarang bisa diatur per event**
   - helper Discord sekarang mendukung pilihan route:
     - nonaktif
     - alert saja
     - billing saja
     - keduanya
   - test Discord dari halaman Pengaturan sekarang menembak webhook `alert` dan `billing` sekaligus
   - event yang bisa diatur:
     - dashboard dibuka
     - generate tagihan
     - pembayaran lunas
     - pelanggan jatuh tempo
     - masalah WhatsApp
     - masalah MikroTik
     - cron gagal
   - file utama:
     - [app/Helpers/discord.php](/D:/xampp/htdocs/Dashboard/app/Helpers/discord.php)
     - [app/Controllers/PengaturanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/PengaturanController.php)
     - [app/Views/pengaturan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/pengaturan/index.php)

3. **Invoice untuk tagihan lunas**
   - detail tagihan sekarang punya tombol `Invoice` jika status sudah `lunas`
   - route baru:
     - `/tagihan/invoice?id=...`
   - invoice bisa dicetak langsung dari browser
   - file utama:
     - [app/Controllers/TagihanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/TagihanController.php)
     - [app/Views/tagihan/show.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/show.php)
     - [app/Views/tagihan/invoice.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/invoice.php)

4. **Stabilisasi Discord bot + tambahan test**
   - crash bot `ECONNREFUSED ::1:3306` ditangani dengan normalisasi host database:
     - `localhost`
     - `::1`
     - kosong
     menjadi `127.0.0.1`
   - startup bot sekarang memberi log error yang lebih jelas tentang target DB
   - test baru ditambahkan untuk:
     - helper Discord
     - formatter status layanan
     - konfigurasi DB bot Node
   - file utama:
     - [discord-bot/src/db.js](/D:/xampp/htdocs/Dashboard/discord-bot/src/db.js)
     - [discord-bot/src/index.js](/D:/xampp/htdocs/Dashboard/discord-bot/src/index.js)
     - [discord-bot/tests/db.test.js](/D:/xampp/htdocs/Dashboard/discord-bot/tests/db.test.js)
     - [tests/Unit/DiscordHelperTest.php](/D:/xampp/htdocs/Dashboard/tests/Unit/DiscordHelperTest.php)
     - [tests/Unit/ServiceStatusTest.php](/D:/xampp/htdocs/Dashboard/tests/Unit/ServiceStatusTest.php)

## Progress Turn Ini (turn ke-5) - Billing Rule Update & Cleanup

1. **Bug Master Paket diperbaiki**
   - error `SQLSTATE[HY093]` saat tambah paket diperbaiki dengan binding parameter eksplisit di:
     - [app/Models/Paket.php](/D:/xampp/htdocs/Dashboard/app/Models/Paket.php)

2. **Pelanggan sekarang bisa ganti status langsung dari daftar**
   - dropdown status `active/limit/inactive` ditambahkan di:
     - [app/Views/pelanggan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/pelanggan/index.php)
   - endpoint cepat ditambahkan di:
     - [app/Controllers/PelangganController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/PelangganController.php)

3. **Aturan billing baru**
   - pelanggan baru `limit` setelah **5 hari** lewat jatuh tempo
   - status tampilan `menunggak` sekarang berdasarkan umur tunggakan, default **30 hari**
   - reminder otomatis sekarang configurable, default **3 hari sebelum jatuh tempo**
   - nomor invoice sekarang dihitung dengan format:
     - `tanggal-bulan-tahun/id_pelanggan/kecepatan_paket/seri`
   - file utama:
     - [app/Models/Pelanggan.php](/D:/xampp/htdocs/Dashboard/app/Models/Pelanggan.php)
     - [app/Models/Tagihan.php](/D:/xampp/htdocs/Dashboard/app/Models/Tagihan.php)
     - [app/Scheduler.php](/D:/xampp/htdocs/Dashboard/app/Scheduler.php)

4. **WhatsApp action dipisah per trigger**
   - daftar tagihan sekarang punya menu `Kirim WA` untuk:
     - reminder
     - jatuh tempo hari ini
     - batas 5 hari
     - pembayaran lunas
   - klik `Lunas` sekarang juga mencoba kirim WA otomatis template `lunas`
   - file utama:
     - [app/Controllers/TagihanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/TagihanController.php)
     - [app/Views/tagihan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/index.php)
     - [app/Views/tagihan/show.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/show.php)

5. **Template WA sekarang CRUD penuh**
   - tidak terbatas 3 template bawaan saja
   - bisa tambah, edit, hapus, dan aktivasi/nonaktivasi template sendiri
   - placeholder baru:
     - `{invoice_number}`
     - `{status_pembayaran}`
     - `{hari_limit}`
   - file utama:
     - [app/Models/TemplateWA.php](/D:/xampp/htdocs/Dashboard/app/Models/TemplateWA.php)
     - [app/Controllers/TemplateController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/TemplateController.php)
     - [app/Views/template/index.php](/D:/xampp/htdocs/Dashboard/app/Views/template/index.php)

6. **Maps dihapus dari UI**
   - route `/maps` dan menu sidebar sudah dihapus
   - file controller/view maps masih ada di repo, tapi sudah tidak terekspos ke user

7. **Auto backup sekarang bisa diaktifkan/dimatikan**
   - setting baru:
     - `backup_auto_enabled`
     - `backup_auto_time`
   - scheduler bisa menjalankan backup otomatis dan pruning file lama
   - file utama:
     - [app/Support/DatabaseBackup.php](/D:/xampp/htdocs/Dashboard/app/Support/DatabaseBackup.php)
     - [app/Controllers/BackupController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/BackupController.php)
     - [app/Views/pengaturan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/pengaturan/index.php)

8. **Test suite diperluas dan tetap lolos**
   - total sekarang:
     - `42 tests`
     - `78 assertions`
   - test yang diupdate:
     - [tests/Unit/TagihanStatusTest.php](/D:/xampp/htdocs/Dashboard/tests/Unit/TagihanStatusTest.php)
     - [tests/Unit/TemplateWATest.php](/D:/xampp/htdocs/Dashboard/tests/Unit/TemplateWATest.php)

## Progress Turn Ini (turn ke-6) - Planning Branch go-dev

1. Branch aktif untuk rewrite sudah terkonfirmasi:
   - `go-dev`

2. Dokumen planning untuk rewrite Go + React + SQLite sudah dibuat:
   - [docs/go-dev/BLUEPRINT.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/BLUEPRINT.md)
   - [docs/go-dev/ARCHITECTURE.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/ARCHITECTURE.md)
   - [docs/go-dev/ROADMAP.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/ROADMAP.md)

3. Arah rewrite yang disepakati di dokumen:
   - backend Go
   - frontend React + TypeScript
   - database SQLite
   - fokus fase awal pada auth, pelanggan, paket, tagihan, invoice, template WA, pengaturan, scheduler, monitoring
   - maps tidak dibawa ke fase awal

4. Catatan penting:
   - planning ini belum mulai implementasi kode Go/React
   - karena worktree branch `go-dev` masih punya perubahan lama yang unrelated, dokumen planning dibuat terpisah agar aman

## Progress Turn Ini (turn ke-7) - Scaffold Awal Go + React

1. Implementasi awal rewrite `go-dev` sudah dimulai di folder baru:
   - [backend](/D:/xampp/htdocs/Dashboard/backend)
   - [frontend](/D:/xampp/htdocs/Dashboard/frontend)

2. **Backend Go** sekarang sudah punya fondasi runnable:
   - entrypoint:
     - [backend/cmd/api/main.go](/D:/xampp/htdocs/Dashboard/backend/cmd/api/main.go)
   - config env:
     - [backend/internal/config/config.go](/D:/xampp/htdocs/Dashboard/backend/internal/config/config.go)
   - router + handler:
     - [backend/internal/http/router/router.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/router/router.go)
     - [backend/internal/http/handler/health.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/health.go)
     - [backend/internal/http/handler/dashboard.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/dashboard.go)
     - [backend/internal/http/handler/meta.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/meta.go)
   - SQLite bootstrap:
     - [backend/internal/platform/database/sqlite.go](/D:/xampp/htdocs/Dashboard/backend/internal/platform/database/sqlite.go)
   - migration runner:
     - [backend/internal/platform/migrate/migrate.go](/D:/xampp/htdocs/Dashboard/backend/internal/platform/migrate/migrate.go)
     - [backend/internal/platform/migrate/sql/0001_initial.sql](/D:/xampp/htdocs/Dashboard/backend/internal/platform/migrate/sql/0001_initial.sql)

3. Endpoint yang sudah hidup:
   - `GET /health`
   - `GET /api/v1/meta`
   - `GET /api/v1/dashboard/summary`

4. Migration SQLite awal sudah menyiapkan tabel inti:
   - `users`
   - `paket`
   - `pelanggan`
   - `tagihan`
   - `payment_history`
   - `template_wa`
   - `pengaturan`
   - `action_logs`
   - `schema_migrations`

5. **Frontend React + Vite + TypeScript** sudah dibuat sebagai shell UI:
   - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
   - [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)
   - [frontend/src/styles.css](/D:/xampp/htdocs/Dashboard/frontend/src/styles.css)
   - UI sekarang langsung membaca:
     - `/health`
     - `/api/v1/dashboard/summary`

6. Artefak dev untuk rewrite juga sudah dirapikan:
   - `.gitignore` ditambah ignore untuk:
     - `frontend/node_modules`
     - `frontend/dist`
     - `backend/storage/*.db`

7. Test dasar backend ditambahkan:
   - [backend/internal/config/config_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/config/config_test.go)
   - [backend/internal/service/dashboard_summary_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/service/dashboard_summary_test.go)

8. Verifikasi lokal yang sudah lolos:
   - `cd backend && go mod tidy`
   - `cd backend && go test ./...`
   - `cd frontend && npm install`
   - `cd frontend && npm run build`

9. Langkah implementasi berikutnya yang paling natural:
   - auth session/login
   - repository layer untuk pelanggan/paket/tagihan
   - dashboard summary yang lebih kaya
   - form CRUD pertama di React

## Progress Turn Ini (turn ke-8) - Auth + CRUD Awal go-dev

1. **Auth session cookie** untuk rewrite Go sekarang sudah hidup:
   - service auth:
     - [backend/internal/auth/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/auth/service.go)
   - context auth:
     - [backend/internal/auth/context.go](/D:/xampp/htdocs/Dashboard/backend/internal/auth/context.go)
   - handler auth:
     - [backend/internal/http/handler/auth.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/auth.go)
   - middleware proteksi route:
     - [backend/internal/http/router/middleware.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/router/middleware.go)

2. Endpoint auth yang sudah tersedia:
   - `POST /api/v1/auth/login`
   - `GET /api/v1/auth/me`
   - `POST /api/v1/auth/logout`

3. Bootstrap admin sekarang otomatis:
   - username default: `admin`
   - password default: `password`
   - bisa dioverride lewat env:
     - `BOOTSTRAP_ADMIN_USERNAME`
     - `BOOTSTRAP_ADMIN_PASSWORD`

4. Konfigurasi baru ditambahkan di:
   - [backend/internal/config/config.go](/D:/xampp/htdocs/Dashboard/backend/internal/config/config.go)
   - key baru:
     - `SESSION_COOKIE_NAME`
     - `SESSION_TTL_HOURS`
     - `BOOTSTRAP_ADMIN_USERNAME`
     - `BOOTSTRAP_ADMIN_PASSWORD`

5. SQLite schema awal diperluas:
   - tabel baru:
     - `sessions`
   - index dasar ditambahkan untuk:
     - `pelanggan.status`
     - `tagihan.status`
     - `tagihan.periode`
     - `sessions.expires_at`
   - file:
     - [backend/internal/platform/migrate/sql/0001_initial.sql](/D:/xampp/htdocs/Dashboard/backend/internal/platform/migrate/sql/0001_initial.sql)

6. **API Paket** sekarang sudah ada:
   - service/repository:
     - [backend/internal/packages/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/packages/service.go)
   - handler:
     - [backend/internal/http/handler/packages.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/packages.go)
   - route:
     - `GET /api/v1/packages`
     - `POST /api/v1/packages`
     - `PUT /api/v1/packages/{id}`
     - `DELETE /api/v1/packages/{id}`

7. **API Pelanggan** sekarang sudah ada:
   - service/repository:
     - [backend/internal/customers/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/customers/service.go)
   - handler:
     - [backend/internal/http/handler/customers.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/customers.go)
   - route:
     - `GET /api/v1/customers`
     - `POST /api/v1/customers`
     - `PUT /api/v1/customers/{id}`
     - `PATCH /api/v1/customers/{id}/status`

8. **Frontend React** tidak lagi hanya landing shell:
   - sekarang sudah punya:
     - login form
     - dashboard summary
     - tab master paket
     - tab pelanggan
   - file utama:
     - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
     - [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)
     - [frontend/src/types.ts](/D:/xampp/htdocs/Dashboard/frontend/src/types.ts)
     - [frontend/src/styles.css](/D:/xampp/htdocs/Dashboard/frontend/src/styles.css)

9. Build and test status terbaru:
   - `cd backend && go test ./...` -> pass
   - `cd frontend && npm run build` -> pass

10. Test tambahan backend sudah dibuat untuk domain inti awal:
   - [backend/internal/auth/service_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/auth/service_test.go)
   - [backend/internal/packages/service_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/packages/service_test.go)
   - [backend/internal/customers/service_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/customers/service_test.go)

11. Langkah berikutnya yang paling masuk akal setelah titik ini:
   - modul tagihan
   - invoice numbering
   - payment history
   - template WA
   - scheduler subcommand untuk Go backend

## Progress Turn Ini (turn ke-9) - Modul Tagihan Awal go-dev

1. **Backend billing** sekarang sudah punya service dan repository sendiri:
   - [backend/internal/billing/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/billing/service.go)

2. Endpoint tagihan yang sudah tersedia:
   - `GET /api/v1/bills`
   - `POST /api/v1/bills/generate`
   - `POST /api/v1/bills/{id}/pay`

3. Generate tagihan sekarang sudah mengikuti aturan inti:
   - generate per periode `YYYY-MM`
   - hanya pelanggan `active` dan `limit`
   - tidak membuat duplikat untuk periode yang sama
   - jatuh tempo dihitung dari `due day` pelanggan
   - jika tanggal melebihi jumlah hari bulan berjalan, otomatis pakai hari terakhir bulan itu

4. Format nomor invoice awal sudah dipakai:
   - `dd-mm-yyyy/id_pelanggan/kecepatan/seri`
   - contoh pola:
     - `08-04-2026/1/20/001`

5. Pelunasan tagihan sekarang melakukan:
   - ubah status ke `lunas`
   - isi `paid_at`
   - isi `payment_method`
   - simpan histori ke tabel `payment_history`
   - kembalikan status pelanggan ke `active` jika sudah tidak ada tagihan belum bayar lain

6. Handler API baru:
   - [backend/internal/http/handler/bills.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/bills.go)

7. **Frontend React** sekarang punya tab `Tagihan`:
   - generate tagihan manual per periode
   - daftar tagihan
   - tombol `Tandai Lunas`
   - file utama:
     - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
     - [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)
     - [frontend/src/types.ts](/D:/xampp/htdocs/Dashboard/frontend/src/types.ts)

8. Test tambahan untuk billing:
   - [backend/internal/billing/service_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/billing/service_test.go)

9. Verifikasi terbaru:
   - `cd backend && go test ./...` -> pass
   - `cd frontend && npm run build` -> pass

10. Next logical step setelah modul ini:
   - computed display status `jatuh_tempo` / `menunggak`
   - invoice print view
   - payment proof upload
   - template WA
   - scheduler worker untuk auto generate / auto limit

## Progress Turn Ini (turn ke-10) - Billing Lanjutan, Template WA, Worker

1. **Computed display status** tagihan sekarang sudah hidup di backend Go:
   - status DB tetap `belum_bayar` / `lunas`
   - status tampilan sekarang dihitung menjadi:
     - `belum_bayar`
     - `jatuh_tempo`
     - `menunggak`
     - `lunas`
   - implementasi utama:
     - [backend/internal/billing/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/billing/service.go)

2. **Invoice print view** sudah tersedia:
   - endpoint:
     - `GET /api/v1/bills/{id}/invoice`
   - handler:
     - [backend/internal/http/handler/bills.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/bills.go)
   - frontend membuka invoice lewat tab baru dari halaman tagihan

3. **Upload bukti bayar** sudah tersedia:
   - endpoint:
     - `POST /api/v1/bills/{id}/proof`
   - file disimpan ke:
     - `storage/uploads/payment-proofs`
   - path bukti disimpan ke `tagihan.proof_path`
   - jika histori pembayaran sudah ada, `payment_history.proof_path` terbaru ikut diupdate

4. **Template WA** sekarang sudah punya modul sendiri:
   - backend service:
     - [backend/internal/templates/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/templates/service.go)
   - renderer placeholder:
     - [backend/internal/templates/render.go](/D:/xampp/htdocs/Dashboard/backend/internal/templates/render.go)
   - endpoint:
     - `GET /api/v1/templates`
     - `POST /api/v1/templates`
     - `PUT /api/v1/templates/{id}`
     - `DELETE /api/v1/templates/{id}`
   - frontend sekarang punya tab `Template WA`

5. **Settings service** dasar untuk rewrite Go sekarang sudah ada:
   - [backend/internal/settings/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/settings/service.go)
   - key yang sudah dipakai:
     - `billing_reminder_days`
     - `billing_limit_days`
     - `billing_menunggak_days`
     - `wa_gateway_url`
     - `wa_api_key`
     - `wa_account_id`
     - `worker_interval_seconds`

6. **WhatsApp sender** untuk worker sekarang sudah punya adapter nyata:
   - [backend/internal/notifications/whatsapp.go](/D:/xampp/htdocs/Dashboard/backend/internal/notifications/whatsapp.go)
   - memakai kontrak:
     - `POST /api/v1/messages`
     - header `X-API-Key`
     - header `X-Account-Id`

7. **Scheduler worker Go** sekarang sudah dibuat:
   - [backend/internal/worker/worker.go](/D:/xampp/htdocs/Dashboard/backend/internal/worker/worker.go)
   - binary sekarang bisa jalan sebagai:
     - `api`
     - `worker`
   - entrypoint:
     - [backend/cmd/api/main.go](/D:/xampp/htdocs/Dashboard/backend/cmd/api/main.go)

8. Worker saat ini mengerjakan:
   - generate tagihan periode bulan berjalan secara idempotent
   - kirim reminder `reminder_custom`
   - kirim `jatuh_tempo` saat hari H
   - ubah pelanggan ke `limit` setelah melewati batas hari limit
   - kirim template `limit_5hari`

9. Migration tambahan sudah dibuat:
   - [backend/internal/platform/migrate/sql/0002_notifications_settings.sql](/D:/xampp/htdocs/Dashboard/backend/internal/platform/migrate/sql/0002_notifications_settings.sql)
   - isi utama:
     - tabel `notification_logs`
     - seed pengaturan billing + WA + worker

10. Frontend React sekarang punya:
   - computed badge status tagihan
   - tombol invoice
   - upload bukti bayar
   - tab template WA
   - file utama:
     - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
     - [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)
     - [frontend/src/types.ts](/D:/xampp/htdocs/Dashboard/frontend/src/types.ts)

11. Test tambahan:
   - [backend/internal/billing/display_status_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/billing/display_status_test.go)
   - [backend/internal/templates/render_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/templates/render_test.go)

12. Verifikasi terbaru:
   - `cd backend && go test ./...` -> pass
   - `cd frontend && npm run build` -> pass

13. Next logical step setelah titik ini:
   - pengaturan UI untuk rule billing dan WA config
   - pengiriman WA `lunas` langsung saat mark paid
   - riwayat notifikasi di halaman tagihan/monitoring
   - backup worker / monitoring worker heartbeat

## Status Teknis Penting

- `php database/migrate.php` sempat dijalankan
- migration runner awal sempat error karena rollback pada DDL
- runner sudah diperbaiki
- output terakhir menunjukkan:
  - `[skip] 20260409_production_upgrade.sql`
- sebelum lanjut, **verifikasi dulu apakah schema hasil migration sudah benar-benar terpasang di database**
  - cek kolom tambahan di `tagihan`
  - cek tabel:
    - `payment_history`
    - `login_attempts`
    - `system_health_checks`
    - `backup_logs`
    - `migrations`
  - cek kolom `user_id` di `action_log`

## File Yang Sedang Paling Relevan

- [app/Models/Tagihan.php](/D:/xampp/htdocs/Dashboard/app/Models/Tagihan.php)
- [app/Controllers/TagihanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/TagihanController.php)
- [app/Views/tagihan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/index.php)
- [app/Views/dashboard/index.php](/D:/xampp/htdocs/Dashboard/app/Views/dashboard/index.php)
- [app/Models/ActionLog.php](/D:/xampp/htdocs/Dashboard/app/Models/ActionLog.php)
- [public/assets/css/app.css](/D:/xampp/htdocs/Dashboard/public/assets/css/app.css)
- [tests/Unit/TagihanStatusTest.php](/D:/xampp/htdocs/Dashboard/tests/Unit/TagihanStatusTest.php)

### Turn 11: Implementasi Settings, Auto-WA Lunas, dan Observabilitas Pekerja (Go-Dev)

Pada iterasi ini, kami menyelesaikan empat poin roadmap penting pada branch `go-dev`:

1. **Settings API & UI**:
   - Menambahkan handler `GET /api/v1/settings` dan `PUT /api/v1/settings`.
   - Mengimplementasikan UI Pengaturan di frontend (`App.tsx`) untuk mengelola konfigurasi WhatsApp Gateway (URL, API Key, Account ID) dan aturan billing (Reminder Days, Limit Days, Menunggak Days).
   - Pengaturan disimpan di tabel SQLite `pengaturan`.

2. **Auto WhatsApp Lunas**:
   - Menginjeksikan `WhatsAppSender` ke dalam `billing.Service`.
   - Mengubah `MarkPaid` untuk otomatis memicu pengiriman pesan WhatsApp menggunakan trigger `lunas` secara asinkron (di background) apabila tagihan berhasil dibayar.

3. **Notification History**:
   - Menambahkan API endpoint `GET /api/v1/bills/{id}/notifications` menggunakan `NotificationLogRepository`.
   - Menambahkan antarmuka (UI) Riwayat Notifikasi di halaman "Tagihan" dengan fitur "Expand Row" sehingga operator dapat melihat daftar pesan terkirim, status pengiriman (`sent`, `error`), dan respons API gateway.

4. **Worker Heartbeat & Observabilitas**:
   - Memodifikasi logic `RunOnce` pada `worker.go` agar selalu mencatat timestamp terkini pada key `worker_last_heartbeat` di pengaturan setiap interval (default 60s).
   - Memperbarui `/health` endpoint untuk mengevaluasi timestamp tersebut. Apabila interval tertunda, status worker akan menjadi `error` dan merubah *overall status* menjadi `degraded`.
   - Memperbarui UI di Dashboard Login untuk memunculkan Status Pekerja (Worker) bersanding dengan indikator Database.

## Rekomendasi Langkah Berikutnya

Urutan paling aman untuk melanjutkan development `go-dev`:
1. Uji integrasi WhatsApp Gateway secara langsung dengan memasukkan URL gateway riil dan melihat webhook serta message log-nya.
2. Migrasi logic MikroTik yang saat ini masih berbentuk skeleton/stub (sesuai roadmap).
3. Penambahan role/permission sistem user jika dibutuhkan operasional multi-admin.

### Turn 12: Dokumentasi Handoff Khusus Branch go-dev

Pada iterasi ini, fokus utamanya adalah merapikan konteks agar AI agent atau developer lain bisa melanjutkan branch `go-dev` tanpa audit ulang penuh.

1. **Dokumen handoff baru dibuat**
   - file baru:
     - [HANDOFF_GO_DEV.md](/D:/xampp/htdocs/Dashboard/HANDOFF_GO_DEV.md)
   - isi utamanya:
     - tujuan branch rewrite
     - file wajib baca
     - batasan kerja agar tidak menyentuh PHP lama
     - status fitur nyata yang sudah ada
     - endpoint API aktual
     - cara menjalankan API, worker, dan frontend
     - verifikasi minimal
     - known gap yang masih relevan
     - prioritas aman untuk langkah berikutnya

2. **Dokumen ini sengaja disusun berdasarkan state code aktual**
   - bukan hanya berdasarkan roadmap awal
   - endpoint `settings`, `backups`, `invoice`, `proof upload`, dan `notification logs` sudah dicatat eksplisit agar tidak terlewat oleh agent berikutnya

3. **Tujuan praktis**
   - mengurangi token yang terbuang saat handoff
   - menghindari agent baru mengulang pekerjaan yang sebenarnya sudah selesai
   - menjaga continuity saat sesi terputus atau konteks habis

### Turn 13: Monitoring UI React + Auto Backup Policy yang Lebih Matang

Pada iterasi ini, rewrite `go-dev` difokuskan pada observability yang lebih jelas dan backup automation yang lebih terkontrol.

1. **Worker auto-backup sekarang configurable**
   - key pengaturan baru ditambahkan di service settings:
     - `backup_auto_enabled`
     - `backup_auto_time`
     - `backup_retention_count`
   - file utama:
     - [backend/internal/settings/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/settings/service.go)
   - worker sekarang:
     - menghormati status aktif/nonaktif backup
     - hanya menjalankan backup pada jam harian yang dikonfigurasi
     - memakai retention count dari pengaturan
     - menyimpan metadata:
       - `worker_last_backup_date`
       - `worker_last_backup_filename`
   - file utama:
     - [backend/internal/worker/worker.go](/D:/xampp/htdocs/Dashboard/backend/internal/worker/worker.go)

2. **Path backup worker dirapikan**
   - worker tidak lagi hardcode ke `storage/backups` relatif
   - sekarang memakai `cfg.StoragePath`
   - file:
     - [backend/cmd/api/main.go](/D:/xampp/htdocs/Dashboard/backend/cmd/api/main.go)

3. **Health endpoint diperluas**
   - `/health` sekarang tidak hanya mengembalikan status database/worker
   - payload sekarang juga memuat:
     - status backup
     - detail worker heartbeat
     - interval worker
     - status konfigurasi integrasi WA dan Discord
     - info backup terakhir, jadwal, dan retensi
   - file:
     - [backend/internal/http/handler/health.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/health.go)

4. **Frontend React sekarang punya tab Monitoring terpisah**
   - tab baru: `Monitoring`
   - menampilkan:
     - overall status
     - status database
     - status worker
     - status backup otomatis
     - ringkasan readiness integrasi
     - detail heartbeat worker
     - policy backup
     - daftar backup + tombol backup manual
   - backup manual dipindahkan dari halaman Pengaturan ke Monitoring agar operator bisa cek kondisi sistem tanpa masuk form konfigurasi
   - file utama:
     - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
     - [frontend/src/styles.css](/D:/xampp/htdocs/Dashboard/frontend/src/styles.css)
     - [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)

5. **Warning build frontend dibersihkan**
   - import dinamis untuk `api.ts` yang tercampur dengan static import sudah dihapus
   - frontend sekarang memakai import statis untuk settings, backups, dan notification logs

6. **Test tambahan**
   - test baru:
     - [backend/internal/worker/worker_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/worker/worker_test.go)
   - test health diperluas untuk status backup:
     - [backend/internal/http/handler/health_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/health_test.go)

7. **Verifikasi**
   - `cd backend && go test ./...` -> pass
   - `cd frontend && npm run build` -> pass

### Turn 15: User Management Dasar + Backup Verification

Pada iterasi ini, fokus lanjutannya adalah dua hal yang sangat penting untuk production operasional: manajemen user tim dan pembuktian integritas backup.

1. **User management dasar ditambahkan**
   - migration baru:
     - [backend/internal/platform/migrate/sql/0004_users_active.sql](/D:/xampp/htdocs/Dashboard/backend/internal/platform/migrate/sql/0004_users_active.sql)
   - kolom baru pada `users`:
     - `is_active`
   - user inactive sekarang:
     - tidak bisa login
     - tidak lolos autentikasi session
   - file auth yang disesuaikan:
     - [backend/internal/auth/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/auth/service.go)

2. **Service dan API user ditambahkan**
   - package baru:
     - [backend/internal/users/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/users/service.go)
   - handler baru:
     - [backend/internal/http/handler/users.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/users.go)
   - endpoint baru:
     - `GET /api/v1/users`
     - `POST /api/v1/users`
     - `PUT /api/v1/users/{id}`
     - `POST /api/v1/users/{id}/reset-password`
   - seluruh endpoint ini dibatasi untuk `admin`
   - fitur yang didukung:
     - list user
     - tambah user
     - ubah role (`admin` / `petugas`)
     - aktif/nonaktif user
     - reset password

3. **Frontend admin sekarang punya tab Users**
   - tab baru: `Users`
   - hanya tampil untuk role `admin`
   - admin bisa:
     - menambah akun tim
     - mengubah role
     - mengaktifkan / menonaktifkan akun
     - reset password
   - file utama:
     - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
     - [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)
     - [frontend/src/types.ts](/D:/xampp/htdocs/Dashboard/frontend/src/types.ts)

4. **Backup verification ditambahkan**
   - backup sekarang tidak hanya bisa dibuat dan di-download
   - aplikasi juga bisa menjalankan `PRAGMA integrity_check` ke file backup SQLite
   - service:
     - [backend/internal/backup/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/backup/service.go)
   - endpoint baru:
     - `POST /api/v1/backups/{filename}/verify`
   - UI monitoring sekarang punya tombol `Verify` di setiap file backup
   - ini memberi restore drill minimum yang jauh lebih kredibel dibanding hanya mengandalkan file backup ada di disk

5. **Test diperluas**
   - test user service:
     - [backend/internal/users/service_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/users/service_test.go)
   - test backup verification:
     - [backend/internal/backup/service_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/backup/service_test.go)

6. **Verifikasi**
   - `cd backend && go test ./...` -> pass
   - `cd frontend && npm run build` -> pass

### Turn 16: Worker Lease, Readiness Endpoint, dan Artefak Deploy Ubuntu

Pada iterasi ini, fokusnya adalah memperkuat kesiapan runtime untuk environment Linux production dan membuat jalur deploy yang lebih konkret.

1. **Worker lease lock ditambahkan**
   - worker sekarang mencoba mengambil lease di tabel `pengaturan` sebelum loop berjalan
   - ini mengurangi risiko dua worker aktif pada SQLite yang sama
   - key setting baru:
     - `worker_lock_ttl_seconds`
   - file utama:
     - [backend/internal/settings/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/settings/service.go)
     - [backend/internal/worker/worker.go](/D:/xampp/htdocs/Dashboard/backend/internal/worker/worker.go)

2. **Health endpoint production-friendly**
   - endpoint baru:
     - `GET /livez`
     - `GET /readyz`
   - `livez` dipakai untuk liveness probe
   - `readyz` dipakai untuk readiness probe database
   - endpoint observability utama `/health` tetap dipertahankan
   - file utama:
     - [backend/internal/http/handler/health.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/health.go)
     - [backend/internal/http/router/router.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/router/router.go)

3. **Artefak deploy Ubuntu ditambahkan**
   - template env:
     - [backend/.env.example](/D:/xampp/htdocs/Dashboard/backend/.env.example)
   - template systemd:
     - [deploy/go-dev/menettech-go-api.service](/D:/xampp/htdocs/Dashboard/deploy/go-dev/menettech-go-api.service)
     - [deploy/go-dev/menettech-go-worker.service](/D:/xampp/htdocs/Dashboard/deploy/go-dev/menettech-go-worker.service)
   - guide production baru:
     - [docs/go-dev/PRODUCTION.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/PRODUCTION.md)
   - [backend/README.md](/D:/xampp/htdocs/Dashboard/backend/README.md) juga diperbarui agar lebih sesuai dengan mode `api` / `worker`

4. **Repo cleanup**
   - file artefak tooling dengan suffix angka panjang di folder `backend` dihapus
   - `.gitignore` diperluas agar file serupa tidak ikut muncul lagi

5. **Verifikasi**
   - `cd frontend && npm run build` -> pass
   - `cd backend && go test ./...` -> pass
   - catatan: pada environment desktop ini `go test` sempat perlu izin akses cache Go di Windows, tetapi setelah dijalankan dengan izin yang sesuai hasilnya bersih

### Turn 14: Security Hardening + Audit Trail untuk Mendekatkan go-dev ke Production

Pada iterasi ini, fokus utama adalah menutup blocker production yang paling mendasar: login abuse, proteksi request berbasis cookie, dan audit trail operasional.

1. **Login rate limiting ditambahkan**
   - migration baru:
     - [backend/internal/platform/migrate/sql/0003_security_audit.sql](/D:/xampp/htdocs/Dashboard/backend/internal/platform/migrate/sql/0003_security_audit.sql)
   - tabel `login_attempts` ditambahkan untuk mencatat percobaan login per identifier
   - auth service sekarang mendukung:
     - `LOGIN_MAX_ATTEMPTS`
     - `LOGIN_WINDOW_MINUTES`
   - setelah batas gagal tercapai, login akan ditolak dengan `429`
   - file utama:
     - [backend/internal/auth/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/auth/service.go)
     - [backend/internal/http/handler/auth.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/auth.go)
     - [backend/internal/config/config.go](/D:/xampp/htdocs/Dashboard/backend/internal/config/config.go)

2. **CSRF protection untuk SPA cookie auth**
   - protected mutating request (`POST/PUT/PATCH/DELETE`) sekarang wajib membawa header `X-CSRF-Token`
   - token saat ini disamakan dengan opaque session token dan dikembalikan oleh:
     - `POST /api/v1/auth/login`
     - `GET /api/v1/auth/me`
   - frontend sekarang otomatis menyimpan dan mengirim token tersebut pada request mutasi
   - file utama:
     - [backend/internal/http/router/middleware.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/router/middleware.go)
     - [backend/internal/auth/context.go](/D:/xampp/htdocs/Dashboard/backend/internal/auth/context.go)
     - [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)

3. **Session cookie hardening**
   - config baru:
     - `SESSION_COOKIE_SECURE`
   - default-nya aktif otomatis saat `APP_ENV=production`
   - cookie login/logout sekarang mengikuti flag secure tersebut
   - file utama:
     - [backend/internal/config/config.go](/D:/xampp/htdocs/Dashboard/backend/internal/config/config.go)
     - [backend/internal/http/handler/auth.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/auth.go)

4. **Audit trail backend ditambahkan**
   - package baru:
     - [backend/internal/audit/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/audit/service.go)
   - endpoint baru:
     - `GET /api/v1/audit-logs`
   - route ini dibatasi untuk admin
   - middleware audit sekarang mencatat semua request mutasi protected ke tabel `action_logs`
   - login dan logout juga dicatat eksplisit
   - file utama:
     - [backend/internal/http/handler/audit.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/audit.go)
     - [backend/internal/http/router/router.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/router/router.go)
     - [backend/internal/http/router/middleware.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/router/middleware.go)

5. **Frontend sekarang punya tab Audit Log**
   - tab baru: `Audit Log`
   - hanya ditampilkan untuk user role `admin`
   - memuat waktu, user id, action, dan detail ringkas
   - file utama:
     - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
     - [frontend/src/types.ts](/D:/xampp/htdocs/Dashboard/frontend/src/types.ts)

6. **Test diperluas**
   - test auth diperbarui untuk signature login baru dan rate limit:
     - [backend/internal/auth/service_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/auth/service_test.go)
   - test handler audit baru:
     - [backend/internal/http/handler/audit_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/audit_test.go)

7. **Verifikasi**
   - `cd backend && go test ./...` -> pass
   - `cd frontend && npm run build` -> pass

### Turn 17: Monitoring Readiness MikroTik (go-dev)

Iterasi ini fokus pada gap observability yang masih tersisa di rewrite `go-dev`: status konfigurasi MikroTik belum terlihat eksplisit di health/monitoring walaupun sudah disebut di blueprint dan roadmap.

1. **Settings key MikroTik ditambahkan dan distandarkan**
   - key baru di service settings:
     - `mikrotik_host`
     - `mikrotik_user`
     - `mikrotik_pass`
     - `mikrotik_test_username`
   - default aman ditetapkan agar backward-compatible untuk environment lama.
   - file:
     - [backend/internal/settings/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/settings/service.go)

2. **Health endpoint sekarang memuat readiness MikroTik**
   - `/health` bagian `integrations` sekarang memiliki:
     - `mikrotik_configured`
   - bernilai `true` bila host, user, dan password MikroTik sudah terisi.
   - file:
     - [backend/internal/http/handler/health.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/health.go)

3. **Monitoring UI React diperluas untuk MikroTik**
   - ringkasan integrasi sekarang ikut menghitung readiness MikroTik.
   - label ringkasan akan menampilkan `MikroTik siap` jika konfigurasi lengkap.
   - file:
     - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
     - [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)

4. **Form Pengaturan sekarang menyediakan field MikroTik**
   - field baru pada tab Pengaturan:
     - host router
     - username router
     - password router
     - username PPPoE test
   - ini membuat operator bisa melengkapi konfigurasi dari UI tanpa edit manual DB.
   - file:
     - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)

5. **Test backend ditambah**
   - `health_test` sekarang memverifikasi:
     - default `mikrotik_configured = false`
     - menjadi `true` saat host/user/pass tersedia
   - file:
     - [backend/internal/http/handler/health_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/health_test.go)

### Turn 18: Production Readiness Execution (go-dev)

Pada iterasi ini, fokusnya mengeksekusi roadmap menuju production single VPS secara end-to-end (migration path, packaging, observability, dan UAT gate).

1. **Data migration path resmi ditambahkan (legacy MySQL -> go-dev SQLite)**
   - backend sekarang punya mode command baru:
     - `go run ./cmd/api import`
   - source legacy dibaca dari env:
     - `LEGACY_MYSQL_DSN`
     - `IMPORT_DRY_RUN`
   - importer bersifat upsert idempotent untuk tabel inti:
     - `paket`
     - `pelanggan`
     - `template_wa`
     - `pengaturan`
     - `tagihan`
   - output import berupa laporan JSON per tabel (`read`, `upserted`, `skipped`, `errors`).
   - file utama:
     - [backend/cmd/api/main.go](/D:/xampp/htdocs/Dashboard/backend/cmd/api/main.go)
     - [backend/internal/importer/service.go](/D:/xampp/htdocs/Dashboard/backend/internal/importer/service.go)
   - dependency baru:
     - `github.com/go-sql-driver/mysql`

2. **Fail-fast production validation ditambahkan**
   - startup `api` dan `worker` sekarang memvalidasi config saat `APP_ENV=production`.
   - guard utama:
     - `SESSION_COOKIE_SECURE` wajib aktif
     - `BOOTSTRAP_ADMIN_PASSWORD` wajib non-default
     - `SQLITE_PATH` dan `STORAGE_PATH` wajib terisi
   - file:
     - [backend/internal/config/config.go](/D:/xampp/htdocs/Dashboard/backend/internal/config/config.go)
     - [backend/internal/config/config_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/config/config_test.go)

3. **Release packaging dan smoke artifacts ditambahkan**
   - script release:
     - [deploy/go-dev/release.sh](/D:/xampp/htdocs/Dashboard/deploy/go-dev/release.sh)
     - fungsi: test backend, build backend+frontend, pack artefak, generate SHA256
   - script smoke endpoint:
     - [deploy/go-dev/smoke.sh](/D:/xampp/htdocs/Dashboard/deploy/go-dev/smoke.sh)
     - cek: `/livez`, `/readyz`, `/health`

4. **Ops observability diperkuat**
   - `/health` sekarang menyertakan `alerts` operasional yang actionable:
     - database ping gagal
     - heartbeat worker terlambat/unknown
     - backup nonaktif/belum jalan hari ini
     - konfigurasi WA/Discord/MikroTik belum lengkap
   - monitoring UI React sekarang menampilkan panel `Alert Operasional`.
   - file utama:
     - [backend/internal/http/handler/health.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/health.go)
     - [frontend/src/lib/api.ts](/D:/xampp/htdocs/Dashboard/frontend/src/lib/api.ts)
     - [frontend/src/App.tsx](/D:/xampp/htdocs/Dashboard/frontend/src/App.tsx)
     - [frontend/src/styles.css](/D:/xampp/htdocs/Dashboard/frontend/src/styles.css)

5. **Dokumen production/UAT/migration dilengkapi**
   - production guide diperbarui dengan:
     - alur release script
     - smoke check
     - import/cutover
     - incident runbook ringkas
   - dokumen baru migration:
     - [docs/go-dev/DATA_MIGRATION.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/DATA_MIGRATION.md)
   - dokumen baru UAT:
     - [docs/go-dev/UAT_CHECKLIST.md](/D:/xampp/htdocs/Dashboard/docs/go-dev/UAT_CHECKLIST.md)
   - file lain yang ikut diperbarui:
     - [backend/README.md](/D:/xampp/htdocs/Dashboard/backend/README.md)
     - [backend/.env.example](/D:/xampp/htdocs/Dashboard/backend/.env.example)

6. **Gate test/integration diperluas**
   - integration test health sekarang mengecek kontrak payload observability (termasuk `alerts`).
   - file:
     - [backend/internal/http/handler/integration_test.go](/D:/xampp/htdocs/Dashboard/backend/internal/http/handler/integration_test.go)

### Turn 19: Release Artifact Finalization + Legacy Parking

Pada iterasi ini, fokusnya adalah menyelesaikan semua langkah otomatis yang masih bisa dijalankan lokal dan merapikan repo agar root benar-benar fokus ke rewrite `go-dev`.

1. **Release artifacts Linux benar-benar dihasilkan**
   - binary Linux backend berhasil dibuild ke:
     - [deploy/go-dev/dist/menettech-go](/D:/xampp/htdocs/Dashboard/deploy/go-dev/dist/menettech-go)
   - frontend production bundle berhasil dipack ke:
     - [deploy/go-dev/dist/frontend-dist.tar.gz](/D:/xampp/htdocs/Dashboard/deploy/go-dev/dist/frontend-dist.tar.gz)
   - checksum artefak dibuat di:
     - [deploy/go-dev/dist/SHA256SUMS.txt](/D:/xampp/htdocs/Dashboard/deploy/go-dev/dist/SHA256SUMS.txt)

2. **Runtime smoke lokal dijalankan**
   - API dan worker sempat dijalankan lokal
   - endpoint lolos:
     - `/livez`
     - `/readyz`
     - `/health`
   - payload health menunjukkan:
     - database `ok`
     - worker `ok`
   - alert yang masih tersisa saat ini bersifat konfigurasi environment:
     - WhatsApp belum dikonfigurasi
     - Discord belum dikonfigurasi
     - MikroTik belum dikonfigurasi
     - backup hari ini belum berjalan

3. **Codebase legacy dipindahkan dari root**
   - seluruh kode PHP lama dan artefak terkait diparkir ke:
     - [legacy-code](/D:/xampp/htdocs/Dashboard/legacy-code)
   - item utama yang dipindahkan:
     - `app/`
     - `cron/`
     - `database/`
     - `discord-bot/`
     - `public/`
     - `systemd/`
     - `tests/`
     - `vendor/`
     - `routes.php`
     - `composer.json`
     - `composer.lock`
     - `phpunit.xml`
     - `.env`
     - `.env.example`
     - `install.sh`
     - legacy `README.md`

4. **Dokumentasi root/handoff dirapikan**
   - root [README.md](/D:/xampp/htdocs/Dashboard/README.md) sekarang menjelaskan repo sebagai rewrite `go-dev`
   - [HANDOFF_GO_DEV.md](/D:/xampp/htdocs/Dashboard/HANDOFF_GO_DEV.md) diperbarui agar sesuai struktur baru dan gap aktual
