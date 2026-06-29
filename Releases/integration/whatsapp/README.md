# 🚀 WhatsApp API Gateway

REST API Gateway untuk mengirim dan menerima pesan WhatsApp menggunakan `whatsapp-web.js` dan `express`. Dirancang untuk produksi dengan keamanan, validasi, logging, dan webhook bawaan.

---

## ✨ Fitur

| Fitur | Deskripsi |
|---|---|
| 🔐 Auth API Key | Semua endpoint dilindungi header `X-API-Key` |
| 📱 Multi-Device | Mendukung banyak akun WA bersamaan via `X-Account-Id` |
| ⚡ Rate Limiting | Pembatasan request berdasarkan API key |
| 🛡️ IP Whitelist | Batasi akses dari IP tertentu |
| 💬 Kirim Pesan | Teks, media, List Menu, dan Button interaktif |
| ⏰ Scheduled Messages | Jadwalkan pesan di masa depan |
| 🤖 Auto-Reply & AI | Balasan statis atau terintegrasi dengan OpenAI GPT |
| 🪝 Webhook | Notifikasi real-time + HMAC signature |
| 📊 Message History | Simpan & query history pesan (SQLite) |
| 🖥️ Dashboard UI | Panel visual untuk manajemen akun & scan QR |
| 👥 Grup & Kontak | Buat grup, lihat kontak, foto profil |
| 📖 Swagger UI | Dokumentasi interaktif di `/api-docs` |

---

## ⚙️ Persyaratan

- **Node.js** v18+, **npm** v9+
- *(Opsional)* **PM2** untuk production

---

## 🔧 Instalasi

```bash
# 1. Clone repositori
git clone https://github.com/Menet-Tech/Whatsapp.js.git
cd Whatsapp.js

# 2. Install dependencies
npm install

# 3. Salin file env
cp .env.example .env
# Edit .env sesuai kebutuhan Anda
```

---

## ▶️ Menjalankan Server

```bash
# Development (hot-reload)
npm run dev

# Production
npm start
```

Pertama kali dijalankan, sebuah **QR Code** akan muncul di terminal. Scan menggunakan WhatsApp > **Linked Devices** > **Link a Device**.

Setelah scan berhasil, log akan menampilkan:
```
info: [default] WhatsApp client is ready!
info: Server running on port 3000
info: Swagger docs available at http://localhost:3000/api-docs
```

Untuk mengakses Dashboard UI, buka **http://localhost:3000/dashboard** (pastikan `ENABLE_DASHBOARD=true`).

---

## 🌐 Environment Variables (`.env`)

| Variable | Default | Deskripsi |
|---|---|---|
| `PORT` | `3000` | Port server Express |
| `API_KEY` | `rahasia123` | API Key untuk autentikasi |
| `RATE_LIMIT_MAX` | `100` | Max request per window |
| `WEBHOOK_URLS` | `[]` | JSON array URL webhook default |
| `WEBHOOK_SECRET` | *(kosong)* | Secret untuk HMAC signature |
| `IP_WHITELIST` | *(kosong)* | Whitelist IP (kosong = semua) |
| `DISCORD_WEBHOOK_URL`| *(kosong)* | URL Webhook Discord untuk notifikasi |
| `OPENAI_API_KEY`| *(kosong)* | Token OpenAI untuk fitur AI Bot |
| `ENABLE_DASHBOARD`| `true` | Mengaktifkan UI Web di `/dashboard` |

---

## 📡 API Endpoints

Semua endpoint memerlukan header standar: `X-API-Key: <API_KEY>`

### 📱 Multi-Account (Opsional)
Secara default, API Gateway mengirim menggunakan klien `default`. Jika Anda mendatarkan banyak akun via Dashboard atau API, lampirkan header berikut untuk mengirim pesan via akun tertentu:
`X-Account-Id: <NamaAkun>`

> Dokumentasi interaktif lengkap tersedia di **http://localhost:3000/api-docs**

### 🔵 Status
| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/v1/status` | Status koneksi WhatsApp & info akun |
| `GET` | `/health` | Health check (tanpa API Key) |

### 💬 Pesan
| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/v1/messages` | Kirim pesan teks |
| `POST` | `/api/v1/media` | Kirim media (multipart/form-data) |
| `GET` | `/api/v1/messages/history` | History pesan terkirim |
| `GET` | `/api/v1/messages/:id/status` | Status satu pesan |

**Contoh kirim pesan:**
```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "X-API-Key: rahasia123" \
  -H "Content-Type: application/json" \
  -d '{"to": "6281234567890", "text": "Halo dari Gateway!"}'
```

### ⏰ Scheduled Messages
| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/v1/scheduled` | Jadwalkan pesan |
| `GET` | `/api/v1/scheduled` | Lihat semua jadwal |
| `DELETE` | `/api/v1/scheduled/:id` | Batalkan jadwal |

**Contoh:**
```bash
curl -X POST http://localhost:3000/api/v1/scheduled \
  -H "X-API-Key: rahasia123" \
  -H "Content-Type: application/json" \
  -d '{"to": "6281234567890", "text": "Reminder!", "scheduledAt": "2026-03-10T08:00:00"}'
```

### 🤖 Auto-Reply & AI Chatbot
| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/v1/autoreply` | Tambah rule auto-reply statis |
| `GET` | `/api/v1/autoreply` | Lihat semua rule |
| `GET` | `/api/v1/ai` | Lihat setelan OpenAI Bot untuk nomor aktif |
| `PUT` | `/api/v1/ai` | Aktifkan AI Bot & setelan prompt |

**matchType:** `contains` (default) · `exact` · `startsWith`

Pesan yang masuk akan dicocokkan dengan rule statis. Jika tidak ada yang cocok, dan fitur AI Chatbot menyala, pesan akan diteruskan ke OpenAI untuk menghasilkan jawaban cerdas.

### 🪝 Webhook
| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/v1/webhook` | Daftarkan URL webhook |
| `GET` | `/api/v1/webhook` | Lihat semua webhook |
| `DELETE` | `/api/v1/webhook` | Hapus webhook |

Setiap pesan masuk akan di-POST ke semua URL terdaftar dengan payload:
```json
{
  "event": "message",
  "data": {
    "id": "...", "from": "6281xxx@c.us",
    "body": "Isi pesan", "type": "chat",
    "timestamp": 1234567890, "hasMedia": false
  }
}
```
Jika `WEBHOOK_SECRET` diset, header `X-Webhook-Signature: sha256=<hmac>` akan ditambahkan.

**Verifikasi signature (PHP):**
```php
$expected = 'sha256=' . hash_hmac('sha256', file_get_contents('php://input'), 'SECRET_KAMU');
if (!hash_equals($expected, $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'])) die('Invalid');
```

### � Grup
| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/v1/groups` | Buat grup baru |
| `GET` | `/api/v1/groups` | Daftar grup |
| `GET` | `/api/v1/groups/:id` | Detail grup |

### 📋 Kontak
| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/v1/contacts` | Daftar semua kontak |
| `GET` | `/api/v1/contacts/:number` | Detail kontak |
| `GET` | `/api/v1/contacts/:number/profile-picture` | Foto profil |
| `GET` | `/api/v1/contacts/:number/is-registered` | Cek apakah terdaftar di WA |

---

## 🧪 Testing

```bash
# Jalankan semua test
npm test

# Dengan laporan coverage
npm run test:coverage
```

Test suite mencakup:
- ✅ Auth Middleware (API Key)
- ✅ Health Check
- ✅ Validasi input kirim pesan
- ✅ Auto-Reply (unit + integration)
- ✅ Scheduled Messages (unit + integration)
- ✅ Webhook Signature HMAC
- ✅ IP Whitelist Middleware
- ✅ Formatter Utility

---

## 🚢 Deployment (PM2)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

---

## 🆘 Troubleshooting

| Masalah | Solusi |
|---|---|
| Port sudah dipakai | Ganti `PORT` di `.env` |
| QR Code expired | Restart server `npm run dev` |
| Browser lock error | Hapus isi folder `src/whatsapp/sessions/` |
| Nodemon restart loop | Pastikan `nodemon.json` ada & sessions ter-ignore |
| Module not found | Jalankan `npm install` ulang |