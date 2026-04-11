# Menet-Tech Dashboard

Dashboard billing ISP berbasis PHP native MVC untuk mengelola pelanggan, paket, tagihan bulanan, pembayaran, WhatsApp notification, Discord alert, monitoring, dan Discord bot operasional.

Mulai cepat:
- Konteks project untuk AI agent ada di [AGENTS.md](/D:/xampp/htdocs/Dashboard/AGENTS.md)
- Status kerja terakhir ada di [current_progress.md](/D:/xampp/htdocs/Dashboard/current_progress.md)
- Blueprint bisnis ada di [blueprint.md](/D:/xampp/htdocs/Dashboard/blueprint.md)

## Fitur Utama

- Manajemen pelanggan, paket, maps, dan template WhatsApp
- Generate tagihan manual per periode
- Otomasi generate tagihan bulanan via scheduler
- Status tagihan computed: `Belum Bayar`, `Jatuh Tempo`, `Menunggak`, `Lunas`
- Pembayaran lengkap dengan metode bayar, histori, bukti bayar, dan audit operator
- Invoice cetak untuk tagihan yang sudah lunas
- Monitoring status WA Gateway, MikroTik, Discord bot, dan cron
- Discord webhook dengan routing per event: `alert`, `billing`, `keduanya`, atau `nonaktif`
- Discord bot untuk command operasional dasar
- Integrasi MikroTik via RouterOS socket API

## Stack

- PHP 8.1+
- MySQL / MariaDB
- Bootstrap 5
- Chart.js
- DataTables
- Leaflet
- Node.js untuk Discord bot

## Struktur Penting

- Entry app: [public/index.php](/D:/xampp/htdocs/Dashboard/public/index.php)
- Router: [routes.php](/D:/xampp/htdocs/Dashboard/routes.php)
- Scheduler runner: [cron/scheduler.php](/D:/xampp/htdocs/Dashboard/cron/scheduler.php)
- Scheduler logic: [app/Scheduler.php](/D:/xampp/htdocs/Dashboard/app/Scheduler.php)
- Pengaturan: [app/Controllers/PengaturanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/PengaturanController.php)
- Tagihan: [app/Controllers/TagihanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/TagihanController.php)
- Discord helper: [app/Helpers/discord.php](/D:/xampp/htdocs/Dashboard/app/Helpers/discord.php)
- Discord bot: [discord-bot/src/index.js](/D:/xampp/htdocs/Dashboard/discord-bot/src/index.js)

## Setup

### 1. Clone dan install dependency

```bash
composer install
cd discord-bot && npm install
```

### 2. Siapkan environment

Buat `.env` dari `.env.example`, lalu isi minimal:

```env
APP_TIMEZONE=Asia/Jakarta

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=dashboard
DB_USER=root
DB_PASS=
```

Catatan:
- untuk Discord bot, gunakan `DB_HOST=127.0.0.1`, jangan `localhost`, supaya tidak jatuh ke `::1`
- bot sekarang memang menormalisasi `localhost` ke `127.0.0.1`, tapi tetap lebih aman mengisi IPv4 eksplisit

### 3. Import database

Import schema dari:
- [database.sql](/D:/xampp/htdocs/Dashboard/database.sql)

Jika sudah memakai migration upgrade production, pastikan tabel tambahan seperti `payment_history`, `system_health_checks`, `login_attempts`, dan `backup_logs` sudah ada.

### 4. Jalankan aplikasi

Jika memakai XAMPP:
- letakkan project di `htdocs`
- akses `http://localhost/Dashboard/public`

Default login:
- username: `admin`
- password: `password`

## Konfigurasi Pengaturan

Sebagian besar konfigurasi bisa diisi dari halaman `Pengaturan`.

Key penting:
- `nama_isp`
- `no_rekening`
- `wa_gateway_url`
- `wa_api_key`
- `wa_account_id`
- `wa_test_number`
- `discord_billing_url`
- `discord_alert_url`
- `discord_bot_token`
- `discord_application_id`
- `discord_guild_id`
- `mikrotik_host`
- `mikrotik_port`
- `mikrotik_user`
- `mikrotik_pass`
- `mikrotik_test_username`
- `billing_auto_generate_enabled`
- `billing_auto_generate_day`
- `billing_auto_generate_time`

## Discord Webhook

Project ini punya dua webhook:
- `alert`
- `billing`

Test Discord dari halaman pengaturan sekarang menembak dua webhook sekaligus.

Selain itu, user bisa mengatur event mana yang dikirim ke webhook mana:
- dashboard dibuka
- generate tagihan
- pembayaran lunas
- pelanggan jatuh tempo
- masalah WhatsApp
- masalah MikroTik
- cron gagal

## Discord Bot

Lokasi bot:
- [discord-bot](/D:/xampp/htdocs/Dashboard/discord-bot)

Perintah dasar:
- `/summary`
- `/tagihan`
- `/pelanggan`
- `/health`

Jalankan bot:

```bash
cd discord-bot
npm run register
npm start
```

Jika bot dijalankan sebagai service systemd, pastikan environment DB mengarah ke IPv4:

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=dashboard
DB_USER=root
DB_PASS=
```

## Scheduler / Cron

Scheduler ada di:
- [cron/scheduler.php](/D:/xampp/htdocs/Dashboard/cron/scheduler.php)

Jalankan tiap menit:

```bash
php /path/to/project/cron/scheduler.php
```

Scheduler menangani:
- generate tagihan otomatis
- check integrasi
- proses jatuh tempo
- reminder 7 hari
- cron heartbeat

## Monitoring dan Performa

Performa dashboard dan monitoring sudah dioptimalkan:
- halaman tidak lagi melakukan health check live ke WA Gateway dan MikroTik setiap render
- status layanan dibaca dari cache pengaturan + `system_health_checks`
- refresh live sekarang manual dari halaman monitoring

Halaman penting:
- dashboard: [app/Controllers/DashboardController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/DashboardController.php)
- monitoring: [app/Controllers/MonitoringController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/MonitoringController.php)

## Pembayaran dan Invoice

Pembayaran sekarang mendukung:
- metode bayar
- waktu bayar
- catatan pembayaran
- upload bukti pembayaran
- histori pembayaran
- audit operator

Invoice tagihan lunas tersedia di:
- [app/Views/tagihan/invoice.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/invoice.php)

## Testing

### PHP

```bash
vendor/bin/phpunit
```

### Node bot

```bash
cd discord-bot
npm test
```

Status terakhir yang sudah lolos:
- PHPUnit: `39 tests, 73 assertions`
- Node bot test: `4 tests passed`

## Coverage

Test tambahan sudah dibuat untuk area Discord helper, service status, dan konfigurasi DB bot.

Namun, coverage persentase belum bisa dihitung otomatis di environment ini karena PHP belum memiliki coverage driver. Saat ini `phpunit --coverage-*` masih mengembalikan warning:
- `No code coverage driver available`

Supaya target coverage minimal 80% bisa diverifikasi, aktifkan salah satu:
- Xdebug
- PCOV

Contoh setelah driver aktif:

```bash
phpdbg -qrr vendor/bin/phpunit --coverage-text
```

## Verifikasi Cepat

Lint PHP:

```powershell
Get-ChildItem app,public,tests,cron -Recurse -Filter *.php | ForEach-Object { php -l $_.FullName }
```

Check syntax bot:

```bash
node --check discord-bot/src/index.js
node --check discord-bot/src/db.js
```

## Known Notes

- MikroTik client sudah memakai RouterOS socket API, tapi tetap perlu diuji ke router produksi
- Bot Discord belum menjalankan aksi mutasi data seperti generate tagihan atau tandai lunas
- Export laporan PDF native belum ada, saat ini fokus ke CSV / operasional web
- Coverage 80% belum bisa dibuktikan otomatis sampai coverage driver PHP aktif

## Dokumentasi Tambahan

- [AGENTS.md](/D:/xampp/htdocs/Dashboard/AGENTS.md)
- [current_progress.md](/D:/xampp/htdocs/Dashboard/current_progress.md)
- [blueprint.md](/D:/xampp/htdocs/Dashboard/blueprint.md)
- [database.sql](/D:/xampp/htdocs/Dashboard/database.sql)
- [whatsapp-api.md](/D:/xampp/htdocs/Dashboard/whatsapp-api.md)
