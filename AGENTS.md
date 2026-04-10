# AI Agent Guide

Dokumen ini ditujukan untuk AI agent yang akan melanjutkan pengembangan project ini. Baca file ini dulu sebelum membaca file lain yang besar supaya hemat konteks dan tidak buang token.

## 1. Ringkasan Project

- Nama project: `Menet-Tech Dashboard`
- Domain: dashboard billing ISP
- Stack utama:
  - PHP native MVC sederhana
  - MySQL / MariaDB
  - Bootstrap 5
  - Chart.js
  - DataTables
  - Leaflet
  - WhatsApp Gateway internal
  - Discord webhook + Discord bot Node.js
- Entry web app: [public/index.php](/D:/xampp/htdocs/Dashboard/public/index.php)
- Router utama: [routes.php](/D:/xampp/htdocs/Dashboard/routes.php)

## 2. Tujuan Sistem

Sistem ini dipakai untuk:
- mengelola data pelanggan ISP
- mengelola paket internet
- membuat dan memantau tagihan bulanan
- menandai pembayaran lunas
- mengirim notifikasi WhatsApp
- mengirim alert/log ke Discord
- menyediakan akses operasional tambahan lewat Discord bot

## 3. Struktur Penting

### Backend PHP

- Config DB: [app/Config/Database.php](/D:/xampp/htdocs/Dashboard/app/Config/Database.php)
- Router/Core:
  - [app/Core/Router.php](/D:/xampp/htdocs/Dashboard/app/Core/Router.php)
  - [app/Core/Controller.php](/D:/xampp/htdocs/Dashboard/app/Core/Controller.php)
  - [app/Core/Session.php](/D:/xampp/htdocs/Dashboard/app/Core/Session.php)
- Helper:
  - [app/Helpers/url.php](/D:/xampp/htdocs/Dashboard/app/Helpers/url.php)
  - [app/Helpers/discord.php](/D:/xampp/htdocs/Dashboard/app/Helpers/discord.php)

### Controller

- Auth: [app/Controllers/AuthController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/AuthController.php)
- Dashboard: [app/Controllers/DashboardController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/DashboardController.php)
- Pelanggan: [app/Controllers/PelangganController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/PelangganController.php)
- Tagihan: [app/Controllers/TagihanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/TagihanController.php)
- Maps: [app/Controllers/MapsController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/MapsController.php)
- Template WA: [app/Controllers/TemplateController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/TemplateController.php)
- Paket: [app/Controllers/PaketController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/PaketController.php)
- Pengaturan: [app/Controllers/PengaturanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/PengaturanController.php)

### Model

- Pelanggan: [app/Models/Pelanggan.php](/D:/xampp/htdocs/Dashboard/app/Models/Pelanggan.php)
- Tagihan: [app/Models/Tagihan.php](/D:/xampp/htdocs/Dashboard/app/Models/Tagihan.php)
- Paket: [app/Models/Paket.php](/D:/xampp/htdocs/Dashboard/app/Models/Paket.php)
- Template WA: [app/Models/TemplateWA.php](/D:/xampp/htdocs/Dashboard/app/Models/TemplateWA.php)
- Pengaturan: [app/Models/Pengaturan.php](/D:/xampp/htdocs/Dashboard/app/Models/Pengaturan.php)
- Dashboard summary: [app/Models/Dashboard.php](/D:/xampp/htdocs/Dashboard/app/Models/Dashboard.php)
- Action log: [app/Models/ActionLog.php](/D:/xampp/htdocs/Dashboard/app/Models/ActionLog.php)
- WhatsApp API: [app/Models/WhatsAppAPI.php](/D:/xampp/htdocs/Dashboard/app/Models/WhatsAppAPI.php)
- MikroTik API: [app/Models/MikroTikAPI.php](/D:/xampp/htdocs/Dashboard/app/Models/MikroTikAPI.php)

### View yang paling sering disentuh

- Layout:
  - [app/Views/layouts/header.php](/D:/xampp/htdocs/Dashboard/app/Views/layouts/header.php)
  - [app/Views/layouts/sidebar.php](/D:/xampp/htdocs/Dashboard/app/Views/layouts/sidebar.php)
  - [app/Views/layouts/footer.php](/D:/xampp/htdocs/Dashboard/app/Views/layouts/footer.php)
- Dashboard: [app/Views/dashboard/index.php](/D:/xampp/htdocs/Dashboard/app/Views/dashboard/index.php)
- Pelanggan list/form/show:
  - [app/Views/pelanggan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/pelanggan/index.php)
  - [app/Views/pelanggan/form.php](/D:/xampp/htdocs/Dashboard/app/Views/pelanggan/form.php)
  - [app/Views/pelanggan/show.php](/D:/xampp/htdocs/Dashboard/app/Views/pelanggan/show.php)
- Tagihan: [app/Views/tagihan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/index.php)
- Paket: [app/Views/paket/index.php](/D:/xampp/htdocs/Dashboard/app/Views/paket/index.php)
- Pengaturan: [app/Views/pengaturan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/pengaturan/index.php)

### Frontend asset

- CSS global: [public/assets/css/app.css](/D:/xampp/htdocs/Dashboard/public/assets/css/app.css)
- JS global: [public/assets/js/app.js](/D:/xampp/htdocs/Dashboard/public/assets/js/app.js)

### Cron / Scheduler

- Runner: [cron/scheduler.php](/D:/xampp/htdocs/Dashboard/cron/scheduler.php)
- Logic: [app/Scheduler.php](/D:/xampp/htdocs/Dashboard/app/Scheduler.php)

### Discord bot

- Package: [discord-bot/package.json](/D:/xampp/htdocs/Dashboard/discord-bot/package.json)
- Bot runtime: [discord-bot/src/index.js](/D:/xampp/htdocs/Dashboard/discord-bot/src/index.js)
- Slash commands: [discord-bot/src/commands.js](/D:/xampp/htdocs/Dashboard/discord-bot/src/commands.js)
- Command registration: [discord-bot/src/register-commands.js](/D:/xampp/htdocs/Dashboard/discord-bot/src/register-commands.js)
- DB helper bot: [discord-bot/src/db.js](/D:/xampp/htdocs/Dashboard/discord-bot/src/db.js)

## 4. Cara Kerja Bisnis Saat Ini

### Pelanggan

- pelanggan disimpan di tabel `pelanggan`
- field jatuh tempo sekarang diperlakukan sebagai `tanggal dalam bulan`, bukan tanggal penuh permanen
- secara teknis masih disimpan di kolom `tgl_jatuh_tempo` bertipe `DATE`
- aplikasi hanya memakai angka harinya
- helper utama:
  - `Pelanggan::normalizeDueDay()`
  - `Pelanggan::extractDueDay()`
  - `Pelanggan::resolveDueDateForPeriod()`
  - `Pelanggan::resolveDueDateFromStored()`

Contoh:
- kalau user punya jatuh tempo `8`, yang penting adalah tanggal `8` setiap bulan
- bulan dan tahun menyesuaikan periode tagihan

### Tagihan

- tagihan tidak dibuat otomatis saat pelanggan baru ditambahkan
- tagihan sekarang bisa di-generate manual dari halaman Tagihan
- generate dilakukan per periode `YYYY-MM`
- hanya pelanggan `active` dan `limit` yang belum punya tagihan pada periode tersebut yang akan dibuatkan tagihan

Method penting:
- `Tagihan::generateForPeriod()`
- `Tagihan::markPaid()`
- `Tagihan::forCustomer()`
- `Tagihan::countUnpaidForCustomer()` — hitung tagihan belum bayar per pelanggan
- `Tagihan::computeDisplayStatus()` — computed display status (lihat bawah)
- `Tagihan::displayStatusBadge()` — badge Bootstrap class untuk display status
- `Tagihan::displayStatusLabel()` — label Bahasa Indonesia untuk display status

### Status Display Tagihan (computed, bukan disimpan di DB)

Status DB hanya `belum_bayar` dan `lunas`. Display status dihitung di PHP:

| Kondisi | Display Status | Badge |
|---------|---------------|-------|
| `lunas` | Lunas | success (hijau) |
| `belum_bayar` + jatuh tempo belum lewat | Belum Bayar | secondary (abu) |
| `belum_bayar` + jatuh tempo sudah lewat + 1 tagihan belum bayar | Jatuh Tempo | warning (kuning) |
| `belum_bayar` + jatuh tempo sudah lewat + 2+ tagihan belum bayar | Menunggak | danger (merah) |

**Penting:** `menunggak` baru muncul jika pelanggan punya **2 atau lebih** tagihan belum bayar yang sudah jatuh tempo.

Query `Tagihan::all()` sudah menyertakan subquery `total_unpaid_count` per pelanggan untuk efisiensi.

### Pelunasan

- tombol `Lunas` sekarang langsung mengubah status tagihan ke `lunas`
- tidak lagi memakai alur `menunggu_wa` sebagai alur utama operasional web
- event pelunasan juga dikirim ke Discord
- **setelah pelunasan, status pelanggan otomatis dikembalikan ke `active`** jika tidak ada tagihan belum bayar lain
- jika masih ada tunggakan lain, status pelanggan tetap `limit`
- lihat `TagihanController::restorePelangganStatusIfPaid()`

### Detail pelanggan

- sekarang ada halaman info pelanggan terpisah
- route: `/pelanggan/show?id=...`
- tujuannya agar operator bisa lihat informasi lengkap tanpa masuk mode edit

## 5. Integrasi Eksternal

### WhatsApp Gateway

- class utama: [app/Models/WhatsAppAPI.php](/D:/xampp/htdocs/Dashboard/app/Models/WhatsAppAPI.php)
- endpoint utama: `POST /api/v1/messages`
- ada fallback `wa.me` jika gagal dan config mengizinkan
- sudah ada health check sederhana ke `/health`
- test WA tersedia di halaman Pengaturan

### Discord

Ada 2 layer:

1. Webhook alerts di PHP
- helper utama: `discordNotify()`
- digunakan untuk:
  - generate tagihan manual
  - pembayaran lunas
  - dashboard heartbeat
  - pelanggan jatuh tempo / limit
  - kegagalan WA
  - test integrasi
  - deteksi masalah WA gateway / MikroTik dari scheduler

2. Discord bot Node.js
- command yang ada:
  - `/summary`
  - `/tagihan`
  - `/pelanggan`
  - `/health`

### MikroTik

- status saat ini: **masih stub aman**
- file: [app/Models/MikroTikAPI.php](/D:/xampp/htdocs/Dashboard/app/Models/MikroTikAPI.php)
- `limitUser()` belum konek ke RouterOS sungguhan
- `testConnection()` saat ini baru validasi konfigurasi dan memberi status stub
- jangan anggap integrasi MikroTik sudah real

## 6. Pengaturan yang Dipakai

Pengaturan penting disimpan di tabel `pengaturan` dan dibaca lewat [app/Models/Pengaturan.php](/D:/xampp/htdocs/Dashboard/app/Models/Pengaturan.php).

Key penting:
- `nama_isp`
- `no_rekening`
- `wa_gateway_url`
- `wa_api_key`
- `wa_account_id`
- `wa_fallback_wa_me`
- `wa_test_number`
- `discord_billing_url`
- `discord_alert_url`
- `discord_bot_token`
- `discord_application_id`
- `discord_guild_id`
- `mikrotik_host`
- `mikrotik_user`
- `mikrotik_pass`
- `mikrotik_test_username`

## 7. Hal yang Sudah Diperbaiki Sebelumnya

- UI dashboard dipoles agar lebih rapi
- chart dashboard diperbaiki agar tinggi chart stabil dan tidak “turun ke bawah”
- master paket sekarang bisa edit/update
- pelanggan memakai model jatuh tempo bulanan berbasis angka tanggal
- tagihan bisa di-generate manual
- detail pelanggan bisa dibuka tanpa mode edit
- nama pelanggan di daftar tagihan bisa diklik ke halaman detail
- test button untuk WA, Discord, dan MikroTik sudah ada
- webhook dan bot Discord sudah ditambahkan
- `.gitignore` sudah disiapkan untuk push ke GitHub
- **[baru]** badge status tagihan sekarang menampilkan Jatuh Tempo / Menunggak berdasarkan kondisi nyata
- **[baru]** bug WA template diperbaiki: tombol WA Me / WA Gateway sekarang pakai template yang sesuai status (lunas → template lunas, belum bayar → jatuh_tempo)
- **[baru]** status pelanggan otomatis kembali ke `active` setelah semua tagihan dilunasi
- **[baru]** log dashboard sekarang menampilkan nama pelanggan, label aksi, waktu relatif, dan bisa di-scroll
- **[baru]** unit test ada 30 test, 46 assertion, semua pass

## 8. Known Limitation

- MikroTik belum real (socket API sudah ada tapi belum diuji ke router nyata)
- bot Discord belum bisa menjalankan aksi mutasi data seperti generate tagihan atau tandai lunas
- scheduler masih punya flow `processMenungguWa()`, tapi operasional web sekarang lebih menekankan `lunas` langsung
- upload bukti bayar sudah ada di form detail tagihan, tapi belum diuji di production
- belum ada role/permission mendalam
- belum ada export laporan PDF (CSV sudah ada)
- status `menunggak` / `jatuh_tempo` adalah **display only** — tidak disimpan di DB `tagihan.status`
- filter di halaman tagihan hanya bisa filter berdasarkan DB status (`belum_bayar` / `lunas`), belum bisa filter computed status

## 9. Cara Verifikasi Cepat

### PHP app

- install dependency:
  - `composer install`
- lint:
  - `Get-ChildItem app,public,tests -Recurse -Filter *.php | ForEach-Object { php -l $_.FullName }`
- test:
  - `vendor\bin\phpunit`

### Discord bot

- install dependency:
  - `cd discord-bot && npm install`
- check syntax:
  - `node --check src/index.js`
  - `node --check src/register-commands.js`
  - `node --check src/commands.js`
- register slash commands:
  - `npm run register`
- run bot:
  - `npm start`

## 10. Prioritas Jika Melanjutkan Development

Urutan prioritas yang paling masuk akal:

1. Integrasi MikroTik sungguhan
2. Bot Discord bisa menjalankan aksi operasional
   Contoh: generate tagihan, tandai lunas, cari pelanggan detail
3. Otomasi generate tagihan bulanan yang konsisten
4. Monitoring cron / health yang lebih solid
5. Histori pembayaran yang lebih lengkap
6. Export laporan
7. Role dan permission

## 11. Saran untuk AI Agent Berikutnya

- jangan ubah schema database sembarangan kalau masih bisa diselesaikan di level aplikasi
- pahami dulu bahwa `tgl_jatuh_tempo` sekarang diperlakukan sebagai `day-of-month`
- cek apakah fitur MikroTik yang diminta user benar-benar butuh koneksi real atau cukup stub
- kalau menyentuh tagihan, baca:
  - [app/Models/Tagihan.php](/D:/xampp/htdocs/Dashboard/app/Models/Tagihan.php)
  - [app/Controllers/TagihanController.php](/D:/xampp/htdocs/Dashboard/app/Controllers/TagihanController.php)
  - [app/Views/tagihan/index.php](/D:/xampp/htdocs/Dashboard/app/Views/tagihan/index.php)
- status tagihan di DB hanya `belum_bayar` dan `lunas`; status `jatuh_tempo` dan `menunggak` adalah **computed display** via `Tagihan::computeDisplayStatus()`
- jangan simpan `jatuh_tempo`/`menunggak` ke kolom `status` di DB
- perubahan status pelanggan ke `active` terjadi otomatis di `TagihanController`, jangan duplikasi logika ini di tempat lain
- kalau menyentuh Discord, cek dua sisi:
  - PHP webhook layer
  - Node bot layer
- sebelum menambah fitur besar, cek apakah route, view, controller, model, dan pengaturan terkait sudah konsisten
- jalankan `vendor\bin\phpunit` setelah membuat perubahan untuk memastikan tidak ada regresi

## 12. Dokumen Referensi Besar

Gunakan hanya jika butuh detail besar:
- Blueprint bisnis: [blueprint.md](/D:/xampp/htdocs/Dashboard/blueprint.md)
- SQL schema: [database.sql](/D:/xampp/htdocs/Dashboard/database.sql)
- WA gateway docs: [whatsapp-api.md](/D:/xampp/htdocs/Dashboard/whatsapp-api.md)

