# Menet-Tech Dashboard

Dashboard billing ISP berbasis PHP native MVC untuk mengelola pelanggan, paket, tagihan bulanan, pembayaran, WhatsApp notification, Discord alert, monitoring, dan Discord bot operasional.

Dokumen penting:
- Konteks cepat untuk AI agent: [AGENTS.md](/D:/xampp/htdocs/Dashboard/AGENTS.md)
- Progress kerja terbaru: [current_progress.md](/D:/xampp/htdocs/Dashboard/current_progress.md)
- Blueprint bisnis: [blueprint.md](/D:/xampp/htdocs/Dashboard/blueprint.md)

## Fitur Utama

- Manajemen pelanggan, paket, maps, dan template WhatsApp
- Generate tagihan manual per periode
- Otomasi generate tagihan bulanan via scheduler
- Status tagihan computed: `Belum Bayar`, `Jatuh Tempo`, `Menunggak`, `Lunas`
- Pembayaran lengkap dengan metode bayar, histori, bukti bayar, audit operator
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
- Installer Linux: [install.sh](/D:/xampp/htdocs/Dashboard/install.sh)
- Template systemd: [systemd](/D:/xampp/htdocs/Dashboard/systemd)

## Deployment Ubuntu Linux

Project ini sudah disiapkan untuk deployment Ubuntu, dan jalur paling disarankan adalah memakai installer:

```bash
chmod +x install.sh
./install.sh
```

`install.sh` akan:
- menginstall dependency sistem yang dibutuhkan
- membuat `.env` dari `.env.example` jika belum ada
- menginstall dependency PHP via Composer
- menginstall dependency Discord bot via npm jika dipilih
- memastikan MySQL/MariaDB jalan
- membuat database `dashboard`
- membuat user database `admin` dengan password default `admin122`
- import schema dari [database/database.sql](/D:/xampp/htdocs/Dashboard/database/database.sql)
- membuat folder runtime:
  - `public/uploads/payment-proofs`
  - `storage/backups`
- menginstall service `systemd` untuk app, scheduler, dan opsional Discord bot

### Paket yang diinstall di Ubuntu

Installer akan mencoba memasang:
- `php`
- `php-cli`
- `php-mbstring`
- `php-xml`
- `php-zip`
- `php-curl`
- `php-mysql`
- `unzip`
- `curl`
- `git`
- `nodejs`
- `npm`
- `mariadb-server` jika MySQL/MariaDB belum ada

### Service systemd yang dibuat

Jika kamu memilih install service:
- `menettech-app.service`
- `menettech-cron.service`
- `menettech-cron.timer`
- `menettech-bot.service` jika bot Discord diaktifkan

Perilaku penting installer:
- app dijalankan memakai built-in PHP server pada `0.0.0.0:80`
- scheduler dijalankan via `systemd timer` tiap 1 menit
- bot Discord dijalankan via `npm start`
- installer bisa menawarkan stop `apache2`, `httpd`, atau `nginx` jika port 80 sudah dipakai
- installer juga bisa membuka port `80/tcp` di UFW

### Setelah install

Cek status service:

```bash
systemctl status menettech-app.service
systemctl status menettech-cron.timer
systemctl status menettech-bot.service
```

Log Discord bot:

```bash
journalctl -u menettech-bot -f
```

## Konfigurasi Environment

Contoh dasar `.env.example`:

```env
APP_NAME="Menet-Tech Dashboard"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost/Dashboard/public
APP_TIMEZONE=Asia/Jakarta

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=dashboard
DB_USER=root
DB_PASS=
```

Catatan penting untuk production Linux:
- untuk Discord bot, gunakan `DB_HOST=127.0.0.1`, jangan `localhost`
- ini penting agar koneksi tidak jatuh ke `::1:3306`
- bot sekarang memang menormalisasi `localhost` ke `127.0.0.1`, tapi tetap lebih aman mengisi IPv4 eksplisit

Catatan installer:
- jika `.env` dibuat lewat `install.sh`, default yang ditawarkan adalah:
  - `APP_ENV=production`
  - `APP_DEBUG=false`
  - `DB_HOST=localhost`
  - `DB_NAME=dashboard`
  - `DB_USER=admin`
  - `DB_PASS=admin122`

Jika bot Discord dipakai, saya sarankan ubah `DB_HOST` di `.env` menjadi:

```env
DB_HOST=127.0.0.1
```

## Akses Aplikasi

Jika memakai built-in web service dari installer:
- aplikasi bind ke `0.0.0.0:80`
- akses via IP server atau domain yang mengarah ke server

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

User juga bisa mengatur event mana yang dikirim ke webhook mana:
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

Menjalankan manual:

```bash
cd discord-bot
npm run register
npm start
```

Catatan Linux:
- jika service `menettech-bot` gagal start, cek `journalctl -u menettech-bot -f`
- jika error mengarah ke `ECONNREFUSED ::1:3306`, ubah `.env` ke `DB_HOST=127.0.0.1`

## Scheduler / Cron

Scheduler ada di:
- [cron/scheduler.php](/D:/xampp/htdocs/Dashboard/cron/scheduler.php)

Jika tidak memakai `systemd timer`, bisa dijalankan manual:

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

```bash
find app public tests cron -name "*.php" -print0 | xargs -0 -n1 php -l
```

Check syntax bot:

```bash
node --check discord-bot/src/index.js
node --check discord-bot/src/db.js
```

Service check di Ubuntu:

```bash
systemctl status menettech-app.service
systemctl status menettech-cron.timer
systemctl status menettech-bot.service
```

## Known Notes

- built-in PHP server di port 80 cocok untuk deploy cepat, tapi untuk production jangka panjang tetap lebih ideal memakai Nginx/Apache + PHP-FPM
- MikroTik client sudah memakai RouterOS socket API, tapi tetap perlu diuji ke router produksi
- Bot Discord belum menjalankan aksi mutasi data seperti generate tagihan atau tandai lunas
- Export laporan PDF native belum ada, saat ini fokus ke CSV / operasional web
- Coverage 80% belum bisa dibuktikan otomatis sampai coverage driver PHP aktif

## Dokumentasi Tambahan

- [AGENTS.md](/D:/xampp/htdocs/Dashboard/AGENTS.md)
- [current_progress.md](/D:/xampp/htdocs/Dashboard/current_progress.md)
- [blueprint.md](/D:/xampp/htdocs/Dashboard/blueprint.md)
- [database.sql](/D:/xampp/htdocs/Dashboard/database.sql)
- [database/database.sql](/D:/xampp/htdocs/Dashboard/database/database.sql)
- [whatsapp-api.md](/D:/xampp/htdocs/Dashboard/whatsapp-api.md)
