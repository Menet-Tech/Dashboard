# Menet-Tech Go Blueprint

Versi ini adalah re-architecture dari dashboard `master` ke stack baru:
- Backend: Go
- Frontend: React
- Database: SQLite

Tujuan utamanya bukan sekadar rewrite, tetapi membuat fondasi yang lebih mudah dipelihara, lebih cepat, dan lebih siap untuk scale deployment Linux.

## Tujuan Produk

Versi `go-dev` harus mempertahankan inti bisnis dari aplikasi saat ini:
- manajemen pelanggan ISP
- manajemen paket internet
- generate tagihan bulanan
- pembayaran dan invoice
- notifikasi WhatsApp
- alert Discord
- scheduler operasional
- monitoring layanan

Yang sengaja tidak dibawa ke fase awal:
- Maps
- Discord bot command mutasi data yang kompleks
- fitur yang terlalu tergantung implementasi PHP lama

## Prinsip Rewrite

1. Jangan 1:1 menyalin struktur PHP lama.
2. Pertahankan aturan bisnis, bukan bentuk kodenya.
3. Jadikan API backend sebagai kontrak utama.
4. UI React harus dipisahkan jelas dari logika backend.
5. SQLite dipakai sebagai default dev dan single-node production ringan.

## Scope Fase 1

Fase 1 fokus ke fitur inti yang wajib hidup:
- Auth login/logout
- Dashboard summary
- CRUD pelanggan
- CRUD paket
- CRUD template WA
- Pengaturan sistem
- Generate tagihan
- Daftar tagihan
- Pelunasan tagihan
- Invoice
- Scheduler:
  - generate bulanan
  - reminder sebelum jatuh tempo
  - auto limit
  - auto backup
- Monitoring dasar

## Scope Fase 2

- Discord bot dengan command read-only
- role/permission yang lebih detail
- export laporan
- hardening audit log
- background job queue jika scheduler mulai berat

## Aturan Bisnis yang Wajib Dibawa

### Pelanggan

- `tgl_jatuh_tempo` diperlakukan sebagai `day-of-month`
- status pelanggan:
  - `active`
  - `limit`
  - `inactive`

### Tagihan

- status database tetap sederhana:
  - `belum_bayar`
  - `lunas`
- status tampilan dihitung:
  - `belum_bayar`
  - `jatuh_tempo`
  - `menunggak`
  - `lunas`

### Rule terbaru

- reminder default: `3 hari sebelum jatuh tempo`
- limit default: `5 hari setelah jatuh tempo`
- menunggak default: `30 hari setelah jatuh tempo`
- nilai-nilai ini harus configurable dari pengaturan

### Invoice

Format nomor invoice:

`dd-mm-yyyy/id_pelanggan/kecepatan_paket/seri`

Contoh:

`27-04-2026/15/20/003`

### WhatsApp

Trigger template minimal:
- `reminder_custom`
- `jatuh_tempo`
- `limit_5hari`
- `lunas`

### Backup

- auto backup bisa aktif/nonaktif
- waktu backup bisa diatur
- retention tetap configurable

## Modul Utama

### 1. Auth
- login
- logout
- session/cookie auth
- rate limit login

### 2. Dashboard
- total pelanggan
- total active
- total limit
- total tunggakan
- chart pendapatan bulanan
- recent logs
- service status snapshot

### 3. Pelanggan
- list
- create
- edit
- detail
- ubah status cepat
- soft delete

### 4. Paket
- list
- create
- edit
- delete dengan proteksi relasi

### 5. Tagihan
- generate periode
- filter
- lihat detail
- tandai lunas
- kirim WA manual per trigger
- invoice print view

### 6. Template WA
- CRUD penuh
- active/inactive
- preview placeholder

### 7. Pengaturan
- WA
- Discord
- billing rules
- backup rules
- MikroTik

### 8. Monitoring
- WA Gateway status
- Discord bot status
- MikroTik status
- cron/scheduler status
- recent errors

### 9. Scheduler
- generate bulanan
- reminder
- auto limit
- auto backup
- heartbeat

## Non-Functional Requirements

- startup backend cepat
- query sederhana dan terukur untuk SQLite
- minimal dependency
- binary backend tunggal
- mudah dijalankan via `systemd`
- mudah dipisah ke PostgreSQL di masa depan jika perlu

## Deliverable Awal

Sebelum implementasi dimulai, branch `go-dev` minimal harus punya:
- blueprint ini
- arsitektur teknis
- roadmap implementasi
- struktur folder target
- keputusan stack final
- migration plan dari data lama
