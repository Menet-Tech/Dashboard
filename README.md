# Menet-Tech Dashboard

Aplikasi billing ISP native PHP berbasis MVC sederhana, dibangun mengikuti `blueprint.md`, memakai MySQL, Bootstrap 5, Chart.js, DataTables, Leaflet, integrasi WhatsApp Gateway internal, dan scheduler PHP.

Untuk AI agent atau developer yang ingin cepat paham konteks project tanpa membaca seluruh repo, mulai dari [AGENTS.md](/D:/xampp/htdocs/Dashboard/AGENTS.md).

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

## Discord Webhook dan Bot

Project ini sekarang punya dua lapisan integrasi Discord:

1. Webhook alerts dari aplikasi PHP
   Dipakai untuk log generate tagihan, pembayaran lunas, jatuh tempo, heartbeat dashboard, dan alert kegagalan integrasi.

2. Discord bot
   Lokasinya di [discord-bot](D:\xampp\htdocs\Dashboard\discord-bot) dan membaca database yang sama untuk command operasional.

### Konfigurasi yang perlu diisi

Di halaman Pengaturan atau `.env`:

- `discord_billing_url`
- `discord_alert_url`
- `discord_bot_token`
- `discord_application_id`
- `discord_guild_id`

### Menjalankan bot

1. Install dependency bot:
   `cd discord-bot && npm install`
2. Register slash commands ke guild:
   `npm run register`
3. Jalankan bot:
   `npm start`

### Slash commands bawaan

- `/summary`
- `/tagihan`
- `/pelanggan`
- `/health`
