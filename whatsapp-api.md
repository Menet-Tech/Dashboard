# WhatsApp API Documentation

Dokumen ini menjelaskan API yang tersedia pada project `Whatsapp.js` di repository ini. Isi dokumentasi disusun berdasarkan implementasi aktual pada source code Express, controller, middleware, service, dan util yang ada di project, sehingga bisa dipakai sebagai referensi integrasi untuk developer backend, frontend, maupun tim QA.

## 1. Ringkasan

- Base HTTP API: `/api/v1`
- Swagger UI: `/api-docs`
- Health check: `/health`
- Static media sementara: `/temp/media/<filename>`
- Auth utama: header `X-API-Key`
- Multi-account selector: header `X-Account-Id`
- Format body yang dipakai:
  - `application/json` untuk mayoritas endpoint
  - `multipart/form-data` untuk upload media
- Server default berjalan di port `3000` kecuali diubah lewat `PORT`

Project ini adalah WhatsApp Gateway berbasis `whatsapp-web.js` yang menyediakan:

- pengiriman pesan teks
- pengiriman media
- pesan interaktif button/list
- manajemen akun WhatsApp multi-account
- pengecekan status akun
- webhook inbound message
- auto-reply rule
- AI reply settings
- manajemen kontak dan grup
- scheduled message
- histori pesan berbasis SQLite

## 2. Base URL

Contoh base URL lokal:

```text
http://localhost:3000
```

Sehingga URL endpoint lengkap menjadi:

```text
http://localhost:3000/api/v1
```

Contoh:

```text
GET http://localhost:3000/api/v1/status
POST http://localhost:3000/api/v1/messages
```

## 3. Headers Wajib

Semua endpoint di bawah `/api/v1` memakai middleware `apiKeyAuth`.

### 3.1 `X-API-Key`

Wajib dikirim di semua request `/api/v1`.

```http
X-API-Key: your_api_key
```

Jika tidak ada atau salah:

```json
{
  "status": "error",
  "message": "Unauthorized"
}
```

Status code:

- `401 Unauthorized`

### 3.2 `X-Account-Id`

Opsional, dipakai untuk memilih akun WhatsApp aktif yang akan dipakai request.

```http
X-Account-Id: default
```

Jika header ini tidak dikirim, server memakai default:

```text
default
```

Catatan:

- Middleware selector hanya menyimpan nilai header ke `req.accountId`.
- Beberapa endpoint non-readiness tetap bisa dipanggil walau akun belum siap.
- Endpoint yang membutuhkan client WhatsApp aktif akan gagal dengan `503` jika akun pada `X-Account-Id` belum ready.

## 4. Mekanisme Keamanan dan Middleware

### 4.1 API Key Auth

Semua route `/api/v1` dilindungi API key.

### 4.2 IP Whitelist

Jika env `IP_WHITELIST` diisi, request dari IP yang tidak masuk whitelist akan ditolak.

Response:

```json
{
  "status": "error",
  "message": "Access denied: IP not whitelisted"
}
```

Status code:

- `403 Forbidden`

### 4.3 Rate Limiting

Rate limit diterapkan berdasarkan `X-API-Key`, fallback ke IP bila header tidak ada.

Default:

- window: `15 menit`
- max: `100 request`

Jika limit terlampaui:

```json
{
  "status": "error",
  "message": "Too many requests for this API key"
}
```

### 4.4 Readiness Middleware

Route tertentu baru bisa dipakai jika akun WhatsApp yang dipilih sudah ready.

Jika belum ready:

```json
{
  "status": "error",
  "message": "WhatsApp client [default] not ready yet"
}
```

Status code:

- `503 Service Unavailable`

Route yang tidak membutuhkan readiness:

- `/status`
- `/accounts`
- `/webhook`
- `/ai`
- `/autoreply`

Route yang membutuhkan readiness:

- `/messages`
- `/media`
- `/groups`
- `/contacts`
- `/scheduled`

## 5. Format Response Umum

Mayoritas endpoint memakai pola berikut:

### 5.1 Success

```json
{
  "status": "success",
  "message": "optional message",
  "data": {}
}
```

atau

```json
{
  "status": "success",
  "id": "generated_id"
}
```

### 5.2 Error

```json
{
  "status": "error",
  "message": "deskripsi error"
}
```

### 5.3 Error internal tak terduga

```json
{
  "status": "error",
  "message": "Internal server error"
}
```

## 6. Format Nomor WhatsApp

Implementasi internal memakai util `formatPhoneNumber()` dengan perilaku:

- jika sudah mengandung `@g.us` atau `@c.us`, dipakai apa adanya
- semua karakter non-digit dihapus
- jika nomor diawali `0`, akan diubah menjadi `62...@c.us`
- jika nomor sudah diawali kode negara, akan menjadi `<digits>@c.us`

Contoh:

- `081234567890` -> `6281234567890@c.us`
- `6281234567890` -> `6281234567890@c.us`
- `120363xxxx@g.us` -> tetap `120363xxxx@g.us`

Saran integrasi:

- untuk chat personal kirim nomor dalam format `62xxxxxxxxxx`
- untuk grup gunakan ID grup asli `...@g.us`

## 7. Endpoint Umum di Luar `/api/v1`

### 7.1 Health Check

`GET /health`

Dipakai untuk health check server HTTP. Tidak memakai API key.

Response:

```json
{
  "status": "ok"
}
```

### 7.2 Swagger UI

`GET /api-docs`

Menampilkan dokumentasi Swagger interaktif.

### 7.3 Static Media

`GET /temp/media/<filename>`

Dipakai untuk mengakses file media sementara dari pesan masuk yang didownload server.

Catatan:

- file di folder temp dibersihkan otomatis setiap jam
- cache max age diset `1 jam`

## 8. Daftar Endpoint API v1

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/v1/status` | Status koneksi WhatsApp |
| `POST` | `/api/v1/accounts` | Inisialisasi akun baru |
| `GET` | `/api/v1/accounts` | List akun |
| `DELETE` | `/api/v1/accounts/:id` | Hapus akun |
| `GET` | `/api/v1/accounts/:id/qr` | Ambil QR raw string akun |
| `POST` | `/api/v1/messages` | Kirim pesan teks |
| `POST` | `/api/v1/messages/interactive` | Kirim button/list message |
| `POST` | `/api/v1/messages/:id/react` | React ke pesan |
| `GET` | `/api/v1/messages/history` | List histori pesan |
| `GET` | `/api/v1/messages/:id/status` | Detail satu pesan dari DB |
| `POST` | `/api/v1/media` | Kirim file media |
| `POST` | `/api/v1/groups` | Buat grup |
| `GET` | `/api/v1/groups` | List grup |
| `GET` | `/api/v1/groups/:id` | Detail grup |
| `GET` | `/api/v1/contacts` | List kontak |
| `GET` | `/api/v1/contacts/:number` | Detail kontak |
| `GET` | `/api/v1/contacts/:number/profile-picture` | URL foto profil |
| `GET` | `/api/v1/contacts/:number/is-registered` | Cek registrasi nomor |
| `POST` | `/api/v1/scheduled` | Buat pesan terjadwal |
| `GET` | `/api/v1/scheduled` | List jadwal |
| `DELETE` | `/api/v1/scheduled/:id` | Batalkan jadwal |
| `POST` | `/api/v1/webhook` | Tambah webhook |
| `GET` | `/api/v1/webhook` | List webhook |
| `DELETE` | `/api/v1/webhook` | Hapus webhook |
| `POST` | `/api/v1/autoreply` | Tambah auto-reply rule |
| `GET` | `/api/v1/autoreply` | List auto-reply rule |
| `PATCH` | `/api/v1/autoreply/:id` | Enable/disable rule |
| `DELETE` | `/api/v1/autoreply/:id` | Hapus rule |
| `GET` | `/api/v1/ai` | Lihat konfigurasi AI |
| `PUT` | `/api/v1/ai` | Update konfigurasi AI |

## 9. Status API

### 9.1 Get Status

`GET /api/v1/status`

Mengembalikan status koneksi WhatsApp.

Headers:

- `X-API-Key: <api_key>`
- `X-Account-Id: <account_id>` opsional

Contoh request:

```bash
curl -X GET http://localhost:3000/api/v1/status \
  -H "X-API-Key: rahasia123"
```

Response saat belum ready:

```json
{
  "status": "ok",
  "whatsapp_ready": false
}
```

Response saat ready:

```json
{
  "status": "ok",
  "whatsapp_ready": true,
  "user": "Nama Akun",
  "phone": "6281234567890@c.us"
}
```

Catatan implementasi:

- route ini tidak melalui readiness middleware
- implementasi controller status saat ini mengambil `isReady()` dan `getClient()` tanpa meneruskan `accountId`, sehingga perilaku riil cenderung merefer ke akun `default`

## 10. Accounts API

Endpoint akun dipakai untuk manajemen session WhatsApp multi-account.

### 10.1 Create Account

`POST /api/v1/accounts`

Membuat atau menginisialisasi akun baru.

Request body:

```json
{
  "accountId": "sales-1"
}
```

Field:

- `accountId` string, wajib, unique identifier akun

Success response:

```json
{
  "status": "success",
  "message": "Inisialisasi akun 'sales-1' dimulai"
}
```

Error jika body tidak lengkap:

```json
{
  "status": "error",
  "message": "accountId required"
}
```

Status code:

- `200 OK`
- `400 Bad Request`

### 10.2 List Accounts

`GET /api/v1/accounts`

Response:

```json
{
  "status": "success",
  "count": 2,
  "data": [
    {
      "accountId": "default",
      "ready": true,
      "hasQr": false
    },
    {
      "accountId": "sales-1",
      "ready": false,
      "hasQr": true
    }
  ]
}
```

### 10.3 Delete Account

`DELETE /api/v1/accounts/:id`

Path param:

- `id` = account ID

Success response:

```json
{
  "status": "success",
  "message": "Akun 'sales-1' berhasil dihapus"
}
```

Jika akun tidak ada:

```json
{
  "status": "error",
  "message": "Account not found"
}
```

Status code:

- `200 OK`
- `404 Not Found`

### 10.4 Get Account QR

`GET /api/v1/accounts/:id/qr`

Mengembalikan raw QR string untuk akun yang belum ready.

Success response:

```json
{
  "status": "success",
  "data": {
    "qr": "raw_qr_string_here"
  }
}
```

Jika QR tidak tersedia:

```json
{
  "status": "error",
  "message": "QR Code belum tersedia atau akun sudah siap"
}
```

Status code:

- `200 OK`
- `404 Not Found`

## 11. Messages API

Route ini membutuhkan akun WhatsApp siap pakai.

### 11.1 Send Text Message

`POST /api/v1/messages`

Headers:

- `X-API-Key`
- `X-Account-Id` opsional
- `Content-Type: application/json`

Request body:

```json
{
  "to": "6281234567890",
  "text": "Halo dari gateway",
  "quotedMessageId": "optional_message_id"
}
```

Field:

- `to` string, wajib, nomor tujuan atau ID chat
- `text` string, wajib, isi pesan
- `quotedMessageId` string|null, opsional, ID pesan yang ingin di-quote

Success response:

```json
{
  "status": "success",
  "message": "Message sent",
  "id": "false_6281234567890@c.us_ABCDEF"
}
```

Validasi error:

```json
{
  "status": "error",
  "message": "\"to\" is required"
}
```

Kemungkinan error lain:

```json
{
  "status": "error",
  "message": "Nomor tidak valid"
}
```

atau

```json
{
  "status": "error",
  "message": "Gagal mengirim pesan: <detail>"
}
```

Status code:

- `200 OK`
- `400 Bad Request`
- `500 Internal Server Error`
- `503 Service Unavailable`

Contoh cURL:

```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "X-API-Key: rahasia123" \
  -H "X-Account-Id: default" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"6281234567890\",\"text\":\"Halo dari gateway\"}"
```

### 11.2 Send Interactive Message

`POST /api/v1/messages/interactive`

Mendukung dua tipe:

- `button`
- `list`

#### A. Button message

Request body:

```json
{
  "to": "6281234567890",
  "type": "button",
  "body": "Silakan pilih menu",
  "title": "Menu Utama",
  "footer": "Balas dengan tombol",
  "buttons": [
    { "body": "Produk" },
    { "body": "Harga" },
    { "body": "Kontak" }
  ]
}
```

Wajib untuk type `button`:

- `buttons` harus array

Jika `buttons` tidak ada:

```json
{
  "status": "error",
  "message": "buttons array required for button message"
}
```

#### B. List message

Request body:

```json
{
  "to": "6281234567890",
  "type": "list",
  "body": "Silakan pilih kategori",
  "title": "Daftar Layanan",
  "footer": "Pilih salah satu",
  "buttonText": "Buka Menu",
  "sections": [
    {
      "title": "Kategori Produk",
      "rows": [
        {
          "id": "produk-1",
          "title": "Produk A",
          "description": "Deskripsi produk A"
        },
        {
          "id": "produk-2",
          "title": "Produk B",
          "description": "Deskripsi produk B"
        }
      ]
    }
  ]
}
```

Wajib untuk type `list`:

- `sections` harus array

Jika `sections` tidak ada:

```json
{
  "status": "error",
  "message": "sections array required for list message"
}
```

Jika `type` tidak valid:

```json
{
  "status": "error",
  "message": "Interactive type must be \"button\" or \"list\""
}
```

Success response:

```json
{
  "status": "success",
  "message": "Interactive message (button) sent",
  "id": "false_6281234567890@c.us_ABCDEF"
}
```

### 11.3 React to Message

`POST /api/v1/messages/:id/react`

Path param:

- `id` = message ID target

Body implementasi saat ini membaca field:

```json
{
  "reaction": "👍"
}
```

Walau komentar Swagger menyebut `emoji`, implementasi controller yang aktif memakai `reaction`.

Response implementasi saat ini:

```json
{
  "status": "success",
  "message": "Reacted to message (Mock)"
}
```

Catatan penting:

- fitur ini masih mock
- endpoint belum benar-benar mereaksikan pesan ke WhatsApp

### 11.4 List Message History

`GET /api/v1/messages/history`

Query params:

- `limit` integer, opsional, default `100`
- `offset` integer, opsional, default `0`

Contoh:

```text
GET /api/v1/messages/history?limit=20&offset=0
```

Response:

```json
{
  "status": "success",
  "count": 2,
  "data": [
    {
      "id": "e7d3f6b2c1a4d8ef",
      "to_number": "6281234567890",
      "body": "Halo dari gateway",
      "type": "text",
      "status": "sent",
      "wa_message_id": "false_6281234567890@c.us_ABCDEF",
      "created_at": "2026-04-09T08:10:00.000Z",
      "sent_at": "2026-04-09T08:10:00.000Z",
      "direction": "outbound",
      "from_number": null,
      "account_id": "default"
    }
  ]
}
```

Catatan:

- histori dibaca dari SQLite `wa_gateway.db`
- endpoint ini tidak memfilter berdasarkan `account_id`
- data inbound dan outbound bisa tercampur dalam satu list

### 11.5 Get Message Status / Detail

`GET /api/v1/messages/:id/status`

Path param:

- `id` = internal message ID database, bukan selalu ID native WhatsApp

Success response:

```json
{
  "status": "success",
  "data": {
    "id": "e7d3f6b2c1a4d8ef",
    "to_number": "6281234567890",
    "body": "Halo dari gateway",
    "type": "text",
    "status": "sent",
    "wa_message_id": "false_6281234567890@c.us_ABCDEF",
    "created_at": "2026-04-09T08:10:00.000Z",
    "sent_at": "2026-04-09T08:10:00.000Z",
    "direction": "outbound",
    "from_number": null,
    "account_id": "default"
  }
}
```

Jika tidak ditemukan:

```json
{
  "status": "error",
  "message": "Pesan tidak ditemukan"
}
```

## 12. Media API

### 12.1 Send Media

`POST /api/v1/media`

Content type:

```http
multipart/form-data
```

Form fields:

- `to` string, wajib
- `caption` string, opsional
- `file` binary, wajib

Contoh cURL:

```bash
curl -X POST http://localhost:3000/api/v1/media \
  -H "X-API-Key: rahasia123" \
  -H "X-Account-Id: default" \
  -F "to=6281234567890" \
  -F "caption=Ini file lampiran" \
  -F "file=@D:/temp/sample.pdf"
```

Success response:

```json
{
  "status": "success",
  "message": "Media sent",
  "id": "false_6281234567890@c.us_ABCDEF"
}
```

Jika file tidak dikirim:

```json
{
  "status": "error",
  "message": "No file uploaded"
}
```

Catatan implementasi:

- file upload disimpan dulu ke folder temp upload
- limit ukuran file `16 MB`
- file lama dibersihkan otomatis setiap jam
- parameter `quotedMessageId` tidak diekspos di controller media walau service mendukungnya

## 13. Groups API

### 13.1 Create Group

`POST /api/v1/groups`

Request body:

```json
{
  "title": "Tim Penjualan",
  "participants": [
    "6281234567890",
    "6289876543210"
  ]
}
```

Field:

- `title` string, wajib
- `participants` array of string, wajib

Nomor participant akan diformat ke `@c.us` oleh server.

Success response:

```json
{
  "status": "success",
  "message": "Group created",
  "data": {
    "title": "Tim Penjualan"
  }
}
```

Validasi error:

```json
{
  "status": "error",
  "message": "\"participants\" is required"
}
```

Catatan:

- bentuk pasti `data` bergantung hasil object dari `client.createGroup()` di `whatsapp-web.js`

### 13.2 List Groups

`GET /api/v1/groups`

Response:

```json
{
  "status": "success",
  "data": [
    {
      "id": "120363xxxxxx@g.us",
      "name": "Tim Penjualan"
    }
  ]
}
```

### 13.3 Get Group Detail

`GET /api/v1/groups/:id`

Path param:

- `id` = group chat id, contoh `120363xxxxxx@g.us`

Success response:

```json
{
  "status": "success",
  "data": {
    "id": {
      "_serialized": "120363xxxxxx@g.us"
    },
    "name": "Tim Penjualan",
    "isGroup": true
  }
}
```

Jika bukan grup atau tidak ditemukan:

```json
{
  "status": "error",
  "message": "Group not found"
}
```

## 14. Contacts API

### 14.1 List Contacts

`GET /api/v1/contacts`

Response:

```json
{
  "status": "success",
  "data": [
    {
      "id": "6281234567890@c.us",
      "name": "Budi",
      "number": "6281234567890"
    }
  ]
}
```

### 14.2 Get Contact Detail

`GET /api/v1/contacts/:number`

Path param:

- `number` = nomor kontak

Contoh:

```text
GET /api/v1/contacts/6281234567890
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": {
      "_serialized": "6281234567890@c.us"
    },
    "name": "Budi",
    "number": "6281234567890"
  }
}
```

Catatan:

- bentuk object `data` mengikuti object contact dari `whatsapp-web.js`

### 14.3 Get Profile Picture

`GET /api/v1/contacts/:number/profile-picture`

Success response:

```json
{
  "status": "success",
  "data": {
    "url": "https://mmg.whatsapp.net/...."
  }
}
```

Jika tidak ada:

```json
{
  "status": "error",
  "message": "Profile picture not found"
}
```

### 14.4 Check Is Registered

`GET /api/v1/contacts/:number/is-registered`

Response:

```json
{
  "status": "success",
  "data": {
    "registered": true
  }
}
```

## 15. Scheduled Messages API

API ini mendukung dua tipe jadwal:

- `once`
- `monthly`

Timezone scheduler diset eksplisit ke:

```text
Asia/Jakarta
```

### 15.1 Create Scheduled Message

`POST /api/v1/scheduled`

#### A. Tipe sekali kirim (`once`)

Request body:

```json
{
  "to": "6281234567890",
  "text": "Reminder meeting",
  "type": "once",
  "scheduledAt": "2026-05-01T09:00:00+07:00"
}
```

Field:

- `to` string, wajib
- `text` string, wajib
- `type` string, opsional, default `once`
- `scheduledAt` string ISO datetime, wajib untuk `once`

#### B. Tipe bulanan (`monthly`)

Request body:

```json
{
  "to": "6281234567890",
  "text": "Reminder tagihan bulanan",
  "type": "monthly",
  "day": 5,
  "time": "09:30"
}
```

Field tambahan untuk `monthly`:

- `day` integer/string tanggal bulanan
- `time` string format `HH:mm`

Jika `to` atau `text` kosong:

```json
{
  "status": "error",
  "message": "Field to dan text wajib diisi"
}
```

Jika `once` tapi `scheduledAt` kosong:

```json
{
  "status": "error",
  "message": "Field scheduledAt wajib diisi untuk tipe once"
}
```

Jika `monthly` tapi `day` atau `time` kosong:

```json
{
  "status": "error",
  "message": "Untuk tipe monthly, day dan time wajib diisi"
}
```

Jika tanggal lampau / invalid:

```json
{
  "status": "error",
  "message": "Internal server error"
}
```

Catatan:

- service melempar error `Waktu harus berupa waktu di masa depan yang valid (ISO 8601)`
- namun error handler umum bisa mengubah error tak dikenal menjadi `Internal server error`

Success response contoh `once`:

```json
{
  "status": "success",
  "message": "Pesan berhasil dijadwalkan",
  "data": {
    "id": "5a6bd6c4a81f22e1",
    "to": "6281234567890",
    "text": "Reminder meeting",
    "description": "Sekali jalan pada 2026-05-01T02:00:00.000Z",
    "type": "once",
    "status": "pending"
  }
}
```

Success response contoh `monthly`:

```json
{
  "status": "success",
  "message": "Pesan berhasil dijadwalkan",
  "data": {
    "id": "4d1be17a88a9d1d2",
    "to": "6281234567890",
    "text": "Reminder tagihan bulanan",
    "description": "Setiap bulannya pada tanggal 5 jam 09:30",
    "type": "monthly",
    "status": "active"
  }
}
```

### 15.2 List Scheduled Messages

`GET /api/v1/scheduled`

Response:

```json
{
  "status": "success",
  "count": 1,
  "data": [
    {
      "id": "4d1be17a88a9d1d2",
      "accountId": "default",
      "to": "6281234567890",
      "text": "Reminder tagihan bulanan",
      "type": "monthly",
      "description": "Setiap bulannya pada tanggal 5 jam 09:30",
      "status": "active",
      "cronExpr": "30 9 5 * *"
    }
  ]
}
```

Catatan:

- endpoint ini juga tidak memfilter berdasarkan `accountId`

### 15.3 Cancel Scheduled Message

`DELETE /api/v1/scheduled/:id`

Success response:

```json
{
  "status": "success",
  "message": "Pesan terjadwal dibatalkan",
  "data": {
    "id": "4d1be17a88a9d1d2",
    "status": "cancelled"
  }
}
```

Jika tidak ada:

```json
{
  "status": "error",
  "message": "Pesan terjadwal tidak ditemukan"
}
```

## 16. Webhook API

Webhook digunakan untuk menerima notifikasi pesan masuk.

### 16.1 Add Webhook URL

`POST /api/v1/webhook`

Request body:

```json
{
  "url": "https://example.com/whatsapp/webhook"
}
```

Success response:

```json
{
  "status": "success",
  "message": "Webhook registered",
  "url": "https://example.com/whatsapp/webhook"
}
```

Jika URL kosong:

```json
{
  "status": "error",
  "message": "URL is required"
}
```

### 16.2 List Webhooks

`GET /api/v1/webhook`

Response:

```json
{
  "status": "success",
  "data": [
    "https://dashboard1.com/webhook",
    "https://example.com/whatsapp/webhook"
  ]
}
```

Catatan:

- data berasal dari gabungan env `WEBHOOK_URLS` dan webhook dinamis yang ditambahkan via API
- duplikat dihapus dengan `Set`

### 16.3 Delete Webhook URL

`DELETE /api/v1/webhook`

Request body:

```json
{
  "url": "https://example.com/whatsapp/webhook"
}
```

Success response:

```json
{
  "status": "success",
  "message": "Webhook removed",
  "url": "https://example.com/whatsapp/webhook"
}
```

## 17. Payload Webhook Inbound

Saat ada pesan masuk non-group dan memiliki body, server akan mengirim POST ke seluruh webhook terdaftar.

Payload:

```json
{
  "event": "message",
  "data": {
    "id": "false_6281234567890@c.us_ABCDEF",
    "from": "6281234567890@c.us",
    "body": "Halo admin",
    "type": "chat",
    "timestamp": 1712640000,
    "hasMedia": false,
    "mediaUrl": null
  }
}
```

Field:

- `event` selalu `message`
- `data.id` ID pesan WhatsApp serialized
- `data.from` pengirim
- `data.body` isi pesan
- `data.type` tipe pesan
- `data.timestamp` unix timestamp dari WhatsApp
- `data.hasMedia` boolean
- `data.mediaUrl` URL file sementara jika media berhasil diunduh, selain itu `null`

Catatan perilaku penting:

- pesan grup diabaikan
- pesan tanpa `body` juga diabaikan
- properti `message.accountId` sempat disuntik sebelum webhook dikirim, tetapi service `handleIncomingMessage()` saat ini tidak memasukkan `accountId` ke payload webhook

### 17.1 HMAC Signature

Jika env `WEBHOOK_SECRET` diisi, server menambahkan header:

```http
X-Webhook-Signature: sha256=<hex_hmac>
```

Signature dibuat dari:

- raw string `JSON.stringify(payload)`
- algoritma `HMAC-SHA256`

Contoh verifikasi Node.js:

```js
const crypto = require('crypto');

function verifySignature(rawBody, receivedSignature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(receivedSignature)
  );
}
```

## 18. Auto Reply API

Auto-reply disimpan in-memory dalam `Map`, bukan persistence database.

Artinya:

- rule hilang saat proses server restart

### 18.1 Create Auto Reply Rule

`POST /api/v1/autoreply`

Request body:

```json
{
  "keyword": "harga",
  "reply": "Harga produk kami mulai dari Rp 50.000",
  "matchType": "contains"
}
```

Field:

- `keyword` string, wajib
- `reply` string, wajib
- `matchType` string, opsional

Nilai `matchType` yang valid:

- `exact`
- `contains`
- `startsWith`

Default:

```text
contains
```

Success response:

```json
{
  "status": "success",
  "message": "Rule auto-reply ditambahkan",
  "data": {
    "id": "a1b2c3d4e5f6",
    "keyword": "harga",
    "reply": "Harga produk kami mulai dari Rp 50.000",
    "matchType": "contains",
    "enabled": true,
    "createdAt": "2026-04-09T08:00:00.000Z"
  }
}
```

Jika field kurang:

```json
{
  "status": "error",
  "message": "Field keyword dan reply wajib diisi"
}
```

Jika `matchType` invalid:

```json
{
  "status": "error",
  "message": "matchType harus salah satu dari: exact, contains, startsWith"
}
```

### 18.2 List Auto Reply Rules

`GET /api/v1/autoreply`

Response:

```json
{
  "status": "success",
  "count": 1,
  "data": [
    {
      "id": "a1b2c3d4e5f6",
      "keyword": "harga",
      "reply": "Harga produk kami mulai dari Rp 50.000",
      "matchType": "contains",
      "enabled": true,
      "createdAt": "2026-04-09T08:00:00.000Z"
    }
  ]
}
```

### 18.3 Enable/Disable Rule

`PATCH /api/v1/autoreply/:id`

Request body:

```json
{
  "enabled": false
}
```

Success response:

```json
{
  "status": "success",
  "message": "Rule dinonaktifkan",
  "data": {
    "id": "a1b2c3d4e5f6",
    "enabled": false
  }
}
```

Jika tidak ada:

```json
{
  "status": "error",
  "message": "Rule tidak ditemukan"
}
```

Catatan:

- implementasi memaksa `!!enabled`
- jika field tidak dikirim, hasilnya `false`

### 18.4 Delete Rule

`DELETE /api/v1/autoreply/:id`

Success response:

```json
{
  "status": "success",
  "message": "Rule dihapus",
  "data": {
    "id": "a1b2c3d4e5f6"
  }
}
```

## 19. AI Settings API

Konfigurasi AI juga disimpan in-memory per `accountId`.

Jika belum pernah di-set, default config akan dibuat otomatis:

```json
{
  "enabled": false,
  "systemPrompt": "Kamu adalah asisten profesional yang siap membantu.",
  "aiProvider": "openai",
  "aiBaseUrl": "https://api.openai.com/v1",
  "aiApiKey": "",
  "aiModel": "gpt-3.5-turbo"
}
```

Catatan:

- nilai default bisa dipengaruhi env `AI_PROVIDER`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- config tidak persisten ke database/file

### 19.1 Get AI Settings

`GET /api/v1/ai`

Response:

```json
{
  "status": "success",
  "data": {
    "enabled": false,
    "systemPrompt": "Kamu adalah asisten profesional yang siap membantu.",
    "aiProvider": "openai",
    "aiBaseUrl": "https://api.openai.com/v1",
    "aiApiKey": "",
    "aiModel": "gpt-3.5-turbo"
  }
}
```

### 19.2 Update AI Settings

`PUT /api/v1/ai`

Request body:

```json
{
  "enabled": true,
  "systemPrompt": "Kamu adalah customer support yang ramah dan singkat.",
  "aiProvider": "openai",
  "aiBaseUrl": "https://api.openai.com/v1",
  "aiApiKey": "sk-xxxx",
  "aiModel": "gpt-4o-mini"
}
```

Semua field bersifat opsional. Hanya field yang dikirim yang akan menimpa config lama.

Success response:

```json
{
  "status": "success",
  "message": "AI settings updated",
  "data": {
    "enabled": true,
    "systemPrompt": "Kamu adalah customer support yang ramah dan singkat.",
    "aiProvider": "openai",
    "aiBaseUrl": "https://api.openai.com/v1",
    "aiApiKey": "sk-xxxx",
    "aiModel": "gpt-4o-mini"
  }
}
```

### 19.3 Cara Kerja AI Reply

Saat pesan masuk:

1. server cek auto-reply rule statis lebih dulu
2. jika tidak ada rule yang match, server akan panggil AI bila `enabled = true`
3. jika AI gagal, tidak ada error HTTP ke pengirim WhatsApp, hanya fallback diam/log error

Model call yang digunakan:

- API OpenAI-compatible chat completion
- `max_tokens: 300`
- `temperature: 0.7`

## 20. Data Persistence

### 20.1 SQLite Messages Table

Server menyimpan histori pesan di file:

```text
wa_gateway.db
```

Skema efektif tabel `messages`:

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `TEXT` | internal message ID |
| `to_number` | `TEXT` | tujuan pesan |
| `body` | `TEXT` | isi pesan |
| `type` | `TEXT` | `text`, `media`, `button`, `list` |
| `status` | `TEXT` | `sent` atau `received` |
| `wa_message_id` | `TEXT` | ID pesan dari WhatsApp |
| `created_at` | `TEXT` | ISO timestamp |
| `sent_at` | `TEXT` | ISO timestamp |
| `direction` | `TEXT` | `outbound` atau `inbound` |
| `from_number` | `TEXT` | asal pesan inbound |
| `account_id` | `TEXT` | akun WhatsApp terkait |

### 20.2 Yang Tidak Persisten

Data berikut tidak persisten dan hilang saat restart:

- auto-reply rules
- AI settings per account
- scheduled messages
- dynamic webhook URLs yang didaftarkan via API

Data yang persisten:

- session WhatsApp LocalAuth di `src/whatsapp/sessions/<accountId>`
- histori pesan di `wa_gateway.db`

## 21. Inbound Message Flow

Alur ketika pesan masuk:

1. event `message` diterima dari `whatsapp-web.js`
2. pesan grup diabaikan
3. jika ada media, server mencoba download media dan simpan sementara
4. pesan inbound disimpan ke database
5. event `chat_message` dikirim ke WebSocket jika `global.io` aktif
6. server cek auto-reply rule
7. jika tidak cocok, server cek AI reply
8. payload webhook dikirim ke semua URL webhook terdaftar

## 22. WebSocket Event Tambahan

Walau bukan REST API, server juga membuka Socket.IO.

Server startup membuat WebSocket di port yang sama dengan HTTP server.

Event yang dipancarkan:

### 22.1 `chat_message`

Dipakai untuk update real-time chat interface.

Contoh payload outbound:

```json
{
  "id": "internal_message_id",
  "account_id": "default",
  "direction": "outbound",
  "from_number": null,
  "to_number": "6281234567890",
  "body": "Halo",
  "type": "text",
  "wa_message_id": "false_6281234567890@c.us_ABCDEF",
  "created_at": "2026-04-09T08:10:00.000Z"
}
```

Contoh payload inbound:

```json
{
  "id": "internal_message_id",
  "account_id": "default",
  "direction": "inbound",
  "from_number": "6281234567890@c.us",
  "to_number": "me",
  "body": "Halo admin",
  "type": "text",
  "wa_message_id": "false_6281234567890@c.us_ABCDEF",
  "created_at": "2026-04-09T08:11:00.000Z"
}
```

## 23. Status Code Reference

| Code | Arti | Kapan muncul |
|---|---|---|
| `200` | OK | Request sukses |
| `400` | Bad Request | Validasi/body/path tidak sesuai |
| `401` | Unauthorized | API key salah/tidak ada |
| `403` | Forbidden | IP tidak masuk whitelist |
| `404` | Not Found | Resource tidak ditemukan |
| `500` | Internal Server Error | Error internal server/WhatsApp |
| `503` | Service Unavailable | Client WhatsApp belum ready |

## 24. Contoh Integrasi Cepat

### 24.1 Cek status

```bash
curl -X GET http://localhost:3000/api/v1/status \
  -H "X-API-Key: rahasia123"
```

### 24.2 Buat akun baru

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "X-API-Key: rahasia123" \
  -H "Content-Type: application/json" \
  -d "{\"accountId\":\"sales-1\"}"
```

### 24.3 Ambil QR akun

```bash
curl -X GET http://localhost:3000/api/v1/accounts/sales-1/qr \
  -H "X-API-Key: rahasia123"
```

### 24.4 Kirim pesan teks

```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "X-API-Key: rahasia123" \
  -H "X-Account-Id: sales-1" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"6281234567890\",\"text\":\"Halo dari akun sales-1\"}"
```

### 24.5 Tambah webhook

```bash
curl -X POST http://localhost:3000/api/v1/webhook \
  -H "X-API-Key: rahasia123" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://example.com/whatsapp/webhook\"}"
```

### 24.6 Tambah auto reply

```bash
curl -X POST http://localhost:3000/api/v1/autoreply \
  -H "X-API-Key: rahasia123" \
  -H "Content-Type: application/json" \
  -d "{\"keyword\":\"harga\",\"reply\":\"Harga mulai Rp 50.000\",\"matchType\":\"contains\"}"
```

## 25. Environment Variables yang Relevan ke API

| Variable | Default | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port HTTP server |
| `API_KEY` | - | API key auth |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Window rate limit |
| `RATE_LIMIT_MAX` | `100` | Maksimum request per window |
| `IP_WHITELIST` | kosong | IP whitelist comma-separated |
| `WEBHOOK_URLS` | `[]` | Default webhook URL list |
| `WEBHOOK_SECRET` | kosong | Secret HMAC webhook |
| `PUBLIC_URL` | `http://localhost` | Base URL untuk media sementara |
| `OPENAI_API_KEY` | kosong | API key AI |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Base URL provider AI |
| `OPENAI_MODEL` | `gpt-3.5-turbo` | Model AI default |
| `AI_PROVIDER` | `openai` | Penanda provider AI |
| `PUPPETEER_ARGS` | predefined | Argumen browser WhatsApp |
| `ENABLE_DASHBOARD` | `true`/env | Mengaktifkan dashboard UI |

## 26. Known Behavior dan Catatan Implementasi

Beberapa perilaku penting dari implementasi saat ini:

- endpoint `POST /messages/:id/react` masih mock, belum benar-benar mengirim reaction ke WhatsApp
- komentar Swagger untuk reaction menyebut field `emoji`, tetapi controller membaca field `reaction`
- endpoint `/status` saat ini cenderung mengacu ke akun `default`, bukan selalu `X-Account-Id`
- histori pesan, scheduled list, dan sebagian data global lain tidak dipisah per account pada level query API
- auto-reply, AI settings, scheduled messages, dan dynamic webhook URL masih berbasis memory process
- payload webhook belum menyertakan `accountId`, walau event inbound mengetahui akun asalnya
- `quotedMessageId` tersedia untuk text message, tetapi belum diekspos untuk media endpoint

## 27. Rekomendasi Pemakaian untuk Developer

- selalu kirim `X-API-Key`
- jika memakai multi-account, selalu kirim `X-Account-Id` secara eksplisit
- cek `/api/v1/status` atau `/api/v1/accounts` sebelum mengirim pesan
- tangani `503` sebagai indikasi akun belum siap atau perlu scan QR
- simpan `id` internal dari response API jika ingin query `/messages/:id/status`
- untuk webhook, verifikasi `X-Webhook-Signature` jika memakai `WEBHOOK_SECRET`
- jangan mengandalkan auto-reply, AI settings, dan scheduled message sebagai storage permanen sebelum ada persistence tambahan

## 28. Penutup

Dokumentasi ini mengikuti implementasi aktual project pada saat file ini dibuat. Jika ada perubahan di controller, service, middleware, atau struktur response, file ini sebaiknya ikut diperbarui agar tetap sinkron dengan perilaku API yang berjalan.
