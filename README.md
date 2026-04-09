# Menet-Tech Dashboard

Aplikasi billing ISP native PHP berbasis MVC sederhana, dibangun mengikuti `blueprint.md`, memakai MySQL, Bootstrap 5, Chart.js, DataTables, Leaflet, integrasi WhatsApp Gateway internal, dan scheduler PHP.

## Jalankan

1. Pastikan Apache dan MySQL XAMPP aktif.
2. Database default: `dashboard`.
3. Konfigurasi koneksi ada di [`.env`](D:\xampp\htdocs\Dashboard\.env).
4. Buka aplikasi dari [public/index.php](D:\xampp\htdocs\Dashboard\public\index.php) melalui URL:
   `http://localhost/Dashboard/public`

## Default Login

- Username: `admin`
- Password: `password`

## Verifikasi yang sudah dijalankan

- Import schema dan seed dari [database.sql](D:\xampp\htdocs\Dashboard\database.sql) ke database `dashboard`
- `composer install`
- `php -l` untuk file PHP aplikasi
- `vendor\bin\phpunit`

## Cron

Jalankan scheduler di [cron/scheduler.php](D:\xampp\htdocs\Dashboard\cron\scheduler.php) setiap menit sesuai blueprint.
