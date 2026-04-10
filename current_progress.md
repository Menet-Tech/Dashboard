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

## Rekomendasi Langkah Berikutnya

Urutan paling aman untuk melanjutkan:

1. Uji manual route baru sebagai admin:
   - `/tagihan` — cek badge Jatuh Tempo / Menunggak
   - `/tagihan` — klik WA Me pada tagihan lunas, pastikan template pesan benar
   - tandai tagihan lunas → cek apakah status pelanggan kembali `active` di `/pelanggan`
   - dashboard → cek log scrollable dengan nama pelanggan
2. Isi konfigurasi:
   - MikroTik host/port/user/pass
   - WA gateway
   - Discord bot + webhook
3. Jalankan Discord bot dan verifikasi heartbeat masuk
4. Uji koneksi MikroTik real dari dashboard/pengaturan
5. Tambah PDF export native jika benar-benar dibutuhkan
6. Tambah edit/nonaktifkan/reset password user bila diperlukan
