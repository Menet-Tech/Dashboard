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

## Progress Turn Ini

### Sudah dikerjakan

1. Menambah fondasi schema extension:
   - file migration dibuat di [database/migrations/20260409_production_upgrade.sql](/D:/xampp/htdocs/Dashboard/database/migrations/20260409_production_upgrade.sql)
   - runner migration dibuat di [database/migrate.php](/D:/xampp/htdocs/Dashboard/database/migrate.php)

2. Model baru ditambahkan:
   - [app/Models/LoginAttempt.php](/D:/xampp/htdocs/Dashboard/app/Models/LoginAttempt.php)
   - [app/Models/PaymentHistory.php](/D:/xampp/htdocs/Dashboard/app/Models/PaymentHistory.php)
   - [app/Models/SystemHealthCheck.php](/D:/xampp/htdocs/Dashboard/app/Models/SystemHealthCheck.php)
   - [app/Models/BackupLog.php](/D:/xampp/htdocs/Dashboard/app/Models/BackupLog.php)
   - [app/Models/Report.php](/D:/xampp/htdocs/Dashboard/app/Models/Report.php)

3. Fondasi auth/security sudah mulai diikat:
   - [app/Controllers/AuthController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/AuthController.php)
   - login rate limiting mulai diimplementasikan memakai `login_attempts`
   - login/logout sudah mulai dicatat ke `action_log`

4. Fondasi role restriction mulai ditambahkan:
   - [app/Core/Controller.php](/D:/xampp/htdocs/Dashboard/app/Core/Controller.php)
   - ada helper `requireAdmin()`

5. Fondasi payment workflow mulai diubah:
   - [app/Models/Tagihan.php](/D:/xampp/htdocs/Dashboard/app/Models/Tagihan.php)
   - sudah ada `registerPayment()`
   - sudah ada `latestUnpaid()`

6. Routing awal untuk modul baru sudah ditambahkan di [routes.php](/D:/xampp/htdocs/Dashboard/routes.php):
   - `/tagihan/show`
   - `/tagihan/pay`
   - `/laporan`
   - `/laporan/export`
   - `/monitoring`
   - `/backup`
   - `/backup/create`

7. Modul tambahan sekarang sudah dibuat:
   - [app/Controllers/ReportController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/ReportController.php)
   - [app/Controllers/MonitoringController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/MonitoringController.php)
   - [app/Controllers/BackupController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/BackupController.php)
   - [app/Controllers/UserController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/UserController.php)

8. View tambahan sudah dibuat:
   - [app/Views/tagihan/show.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/show.php)
   - [app/Views/laporan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/laporan/index.php)
   - [app/Views/monitoring/index.php](/D:/xampp/htdocs/Dashboard/app/Views/monitoring/index.php)
   - [app/Views/backup/index.php](/D:/xampp/htdocs/Dashboard/app/Views/backup/index.php)
   - [app/Views/users/index.php](/D:/xampp/htdocs/Dashboard/app/Views/users/index.php)

9. Payment workflow sekarang sudah mulai lengkap:
   - detail tagihan sudah ada
   - histori pembayaran sudah ada
   - metode bayar sudah ada
   - upload bukti bayar sudah ada
   - audit operator bayar mulai dicatat

10. Monitoring dan observability sudah mulai hidup:
   - panel status dashboard untuk WA / MikroTik / Discord bot / cron
   - halaman monitoring
   - health check table sudah dipakai
   - cron heartbeat + failure status sudah dicatat

11. Backup database sudah mulai ada:
   - halaman backup
   - log backup
   - generator backup via `mysqldump`

12. User management dasar sudah ada:
   - admin bisa buat user baru
   - role admin / petugas mulai dipakai untuk gating fitur sensitif

13. Integrasi MikroTik stub sudah diganti menjadi client RouterOS API berbasis socket:
   - file: [app/Models/MikroTikAPI.php](/D:/xampp/htdocs/Dashboard/app/Models/MikroTikAPI.php)
   - method penting:
     - `testConnection()`
     - `limitUser()`
     - `activateUser()`
     - `kickUser()`
     - `syncStatus()`

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

- [routes.php](/D:/xampp/htdocs/Dashboard/routes.php)
- [app/Controllers/AuthController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/AuthController.php)
- [app/Models/Tagihan.php](/D:/xampp/htdocs/Dashboard/app/Models/Tagihan.php)
- [app/Models/MikroTikAPI.php](/D:/xampp/htdocs/Dashboard/app/Models/MikroTikAPI.php)
- [database/migrations/20260409_production_upgrade.sql](/D:/xampp/htdocs/Dashboard/database/migrations/20260409_production_upgrade.sql)
- [database/migrate.php](/D:/xampp/htdocs/Dashboard/database/migrate.php)

## Rekomendasi Langkah Berikutnya

Urutan paling aman untuk melanjutkan:

1. Uji manual route baru sebagai admin:
   - `/tagihan/show`
   - `/laporan`
   - `/monitoring`
   - `/backup`
   - `/users`
2. Isi konfigurasi:
   - MikroTik host/port/user/pass
   - WA gateway
   - Discord bot + webhook
3. Jalankan Discord bot dan verifikasi heartbeat masuk
4. Uji koneksi MikroTik real dari dashboard/pengaturan
5. Tambah PDF export native jika benar-benar dibutuhkan
6. Tambah edit/nonaktifkan/reset password user bila diperlukan
