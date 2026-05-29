# 🚀 **Blueprint Final: WhatsApp API Gateway dengan `whatsapp-web.js`**
Dokumen ini adalah cetak biru **lengkap dan final** untuk membangun **WhatsApp API Gateway** menggunakan library `whatsapp-web.js`. API Gateway ini akan berfungsi sebagai jembatan antara dashboard PHP (atau aplikasi lain) dan layanan WhatsApp, menyediakan REST API yang aman, stabil, dan siap produksi.

Blueprint ini telah mengakomodasi semua masukan dan peningkatan yang dibahas sebelumnya, termasuk:

- ✅ Manajemen koneksi dengan auto-reconnect
- ✅ Middleware readiness untuk menolak request sebelum client siap
- ✅ Rate limiting per IP dan per API key
- ✅ Validasi input dengan Joi
- ✅ Penanganan file upload (multer) dan pembersihan otomatis
- ✅ Webhook multi-URL dengan dukungan media (URL sementara)
- ✅ Struktur error handling dengan custom error classes
- ✅ Dokumentasi API dengan Swagger
- ✅ Health check endpoint
- ✅ Opsi multiple account (arsitektur dasar)
- ✅ Logging terstruktur dengan Winston
- ✅ Panduan deployment dengan PM2 dan Nginx

---

## 📌 1. Pendahuluan

Proyek ini bertujuan membuat **REST API** yang memungkinkan dashboard PHP (atau aplikasi lain) mengirim dan menerima pesan WhatsApp, mengelola grup, mengirim media, dan memanfaatkan fitur WhatsApp Web lainnya. API Gateway akan berjalan sebagai proses Node.js terpisah, menyimpan sesi WhatsApp secara lokal, dan menyediakan endpoint yang aman dengan autentikasi API key.

### 1.1. Arsitektur Umum

```
[Dashboard PHP] ↔ (HTTPS) ↔ [Node.js API Gateway] ↔ (Puppeteer) ↔ [WhatsApp Web]
```

- **Dashboard PHP** mengirim request ke API Gateway.
- **API Gateway** memproses request menggunakan `whatsapp-web.js`.
- `whatsapp-web.js` mengendalikan instance WhatsApp Web melalui Puppeteer.
- Semua sesi disimpan di folder lokal sehingga tidak perlu scan QR setiap restart.

---

## ⚙️ 2. Persyaratan Sistem

- **Node.js** v18 atau lebih baru
- **NPM** atau Yarn
- **Server** dengan RAM minimal 2 GB (direkomendasikan 4 GB untuk Puppeteer)
- **Koneksi internet** stabil
- **Google Chrome/Chromium** (akan diunduh otomatis oleh Puppeteer, namun pastikan server mendukung)
- **PM2** (untuk production, direkomendasikan)
- **Nginx** (opsional, untuk reverse proxy dan HTTPS)

---

## 📁 3. Struktur Direktori

```
whatsapp-api-gateway/
│
├── src/
│   ├── server.js                 # Entry point aplikasi
│   ├── app.js                    # Inisialisasi Express, middleware, routes
│   ├── config/
│   │   ├── environment.js         # Memuat dan validasi environment variables
│   │   └── constants.js           # Konstanta aplikasi
│   ├── whatsapp/
│   │   ├── client.js              # Inisialisasi client WhatsApp dengan LocalAuth dan auto-reconnect
│   │   ├── events.js              # Handler event (qr, ready, message, disconnected, dll)
│   │   ├── accountManager.js      # (Opsional) Manajemen multiple account
│   │   └── sessions/               # Folder penyimpanan sesi (akan digenerate otomatis)
│   ├── routes/
│   │   ├── v1/
│   │   │   ├── index.js           # Menggabungkan semua route v1
│   │   │   ├── status.routes.js
│   │   │   ├── messages.routes.js
│   │   │   ├── media.routes.js
│   │   │   ├── groups.routes.js
│   │   │   ├── contacts.routes.js
│   │   │   ├── webhook.routes.js  # Untuk menerima konfigurasi webhook (multi-URL)
│   │   │   └── accounts.routes.js # (Opsional) Multiple account
│   │   └── index.js               # Register semua versi route
│   ├── controllers/
│   │   ├── status.controller.js
│   │   ├── messages.controller.js
│   │   ├── media.controller.js
│   │   ├── groups.controller.js
│   │   ├── contacts.controller.js
│   │   ├── webhook.controller.js
│   │   └── accounts.controller.js # (Opsional)
│   ├── middleware/
│   │   ├── auth.js                 # Verifikasi API Key
│   │   ├── errorHandler.js         # Global error handler
│   │   ├── validator.js             # Validasi request dengan Joi
│   │   ├── rateLimiter.js           # Rate limiting per IP dan per API key
│   │   ├── readiness.js             # Middleware untuk memastikan client WhatsApp siap
│   │   └── accountSelector.js       # (Opsional) Memilih client berdasarkan header X-Account-Id
│   ├── services/
│   │   ├── whatsapp.service.js     # Fungsi-fungsi bisnis yang memanggil client
│   │   ├── webhook.service.js       # Mengirim notifikasi ke dashboard (multi-URL)
│   │   └── media.service.js         # Penanganan media (download, simpan sementara)
│   ├── utils/
│   │   ├── logger.js                # Winston logger
│   │   ├── formatter.js              # Format nomor (membedakan personal/group)
│   │   ├── fileHandler.js            # Menyimpan sementara file upload dan pembersihan otomatis
│   │   ├── errors.js                 # Custom error classes
│   │   └── reconnect.js              # Logika reconnect untuk client WhatsApp
│   ├── docs/
│   │   └── swagger.js               # Konfigurasi Swagger/OpenAPI
│   └── temp/                         # Folder temporary untuk file upload dan media (dibersihkan berkala)
│       ├── uploads/
│       └── media/
│
├── .env.example                      # Contoh environment variables
├── .gitignore
├── package.json
├── README.md                          # Dokumentasi singkat
└── ecosystem.config.js                # Konfigurasi PM2
```

---

## 🔧 4. Instalasi dan Konfigurasi

### 4.1. Clone dan Inisialisasi Proyek

```bash
git clone <repository-url> whatsapp-api-gateway
cd whatsapp-api-gateway
npm init -y
```

### 4.2. Install Dependencies

```bash
npm install express whatsapp-web.js qrcode-terminal dotenv joi express-rate-limit winston cors helmet multer axios node-cron
npm install -D nodemon jest supertest
```

### 4.3. Environment Variables

Buat file `.env` berdasarkan `.env.example`:

```env
# Server
PORT=3000
NODE_ENV=production
PUBLIC_URL=http://your-domain.com   # Untuk membuat URL media sementara

# Keamanan
API_KEY=rahasia123  # ganti dengan string acak yang kuat

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000      # 15 menit dalam milidetik
RATE_LIMIT_MAX=100                # maks 100 request per window per IP/key

# Webhook (opsional, multi-URL)
WEBHOOK_URLS=["https://dashboard1.com/webhook", "https://dashboard2.com/webhook"]

# Logging
LOG_LEVEL=info

# Puppeteer / Chrome
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--max-old-space-size=512

# (Opsional) Notifikasi Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 4.4. Menjalankan Server untuk Pertama Kali

```bash
npm run dev   # jika menggunakan nodemon, atau
node src/server.js
```

Akan muncul QR code di terminal. Scan dengan WhatsApp ponsel. Setelah scan, sesi tersimpan di `src/whatsapp/sessions/` (atau subfolder jika multiple account). Server siap digunakan.

**Catatan**: Server Express baru akan benar-benar melayani request setelah event `ready` dari WhatsApp dipastikan. Middleware `readiness` akan menolak request dengan status 503 jika client belum siap.

### 4.5. Production dengan PM2

```bash
npm install -g pm2
pm2 start src/server.js --name wa-gateway
pm2 save
pm2 startup
```

---

## 🧱 5. Implementasi Inti (dengan Peningkatan)

### 5.1. Entry Point (`src/server.js`)

```javascript
require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');
const { initWhatsAppClient, waitForClientReady } = require('./whatsapp/client');

const PORT = process.env.PORT || 3000;

// Inisialisasi client WhatsApp
initWhatsAppClient();

// Tunggu hingga client siap sebelum server mulai menerima request
waitForClientReady().then(() => {
  logger.info('WhatsApp client is ready. Starting server...');
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}).catch(err => {
  logger.error('Failed to initialize WhatsApp client:', err);
  process.exit(1);
});
```

### 5.2. Inisialisasi Express (`src/app.js`)

```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');
const { readinessMiddleware } = require('./middleware/readiness');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(rateLimiter);
app.use(readinessMiddleware);

// Static folder untuk file temporary (media)
app.use('/temp', express.static(path.join(__dirname, 'temp'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    // Hanya file di dalam folder media yang dapat diakses
    if (!filePath.startsWith(path.join(__dirname, 'temp/media'))) {
      return res.status(403).send('Forbidden');
    }
  }
}));

// Routes
app.use('/api', routes);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check (tanpa middleware readiness)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

module.exports = app;
```

### 5.3. Client WhatsApp dengan Auto-Reconnect (`src/whatsapp/client.js`)

```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('../utils/logger');
const { setupEvents } = require('./events');

let client;
let ready = false;
const readyPromiseResolve = [];

const initWhatsAppClient = () => {
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './src/whatsapp/sessions/default'
    }),
    puppeteer: {
      args: process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(',') : ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  setupEvents(client, (status) => {
    ready = status;
    if (status) {
      readyPromiseResolve.forEach(resolve => resolve());
      readyPromiseResolve.length = 0;
    }
  });

  client.initialize();
  return client;
};

const getClient = () => {
  if (!client) throw new Error('WhatsApp client not initialized');
  return client;
};

const isReady = () => ready;

const waitForClientReady = () => {
  if (ready) return Promise.resolve();
  return new Promise(resolve => {
    readyPromiseResolve.push(resolve);
  });
};

// Auto-reconnect logic dipanggil dari event disconnected
const scheduleReconnect = () => {
  logger.info('Scheduling reconnect in 10 seconds...');
  setTimeout(() => {
    logger.info('Attempting to reconnect...');
    initWhatsAppClient();
  }, 10000);
};

module.exports = { initWhatsAppClient, getClient, isReady, waitForClientReady, scheduleReconnect };
```

### 5.4. Event Handler dengan Auto-Reconnect (`src/whatsapp/events.js`)

```javascript
const logger = require('../utils/logger');
const qrcode = require('qrcode-terminal');
const { handleIncomingMessage } = require('../services/webhook.service');
const { scheduleReconnect } = require('./client');
const { saveMediaTemporarily } = require('../utils/fileHandler');
const { sendTelegramAlert } = require('../utils/notifications'); // opsional

const setupEvents = (client, setReadyCallback) => {
  client.on('qr', (qr) => {
    logger.info('QR Code received, scan with WhatsApp');
    qrcode.generate(qr, { small: true });
    setReadyCallback(false);
  });

  client.on('ready', () => {
    logger.info('WhatsApp client is ready!');
    setReadyCallback(true);
  });

  client.on('authenticated', () => {
    logger.info('WhatsApp authenticated');
  });

  client.on('auth_failure', (msg) => {
    logger.error('Authentication failed', msg);
    setReadyCallback(false);
    sendTelegramAlert(`Authentication failed: ${msg}`);
  });

  client.on('disconnected', (reason) => {
    logger.error('Client disconnected', reason);
    setReadyCallback(false);
    sendTelegramAlert(`Client disconnected: ${reason}`);
    scheduleReconnect();
  });

  client.on('message', async (message) => {
    logger.debug(`Message received from ${message.from}: ${message.body}`);
    let mediaUrl = null;
    if (message.hasMedia) {
      try {
        const media = await message.downloadMedia();
        mediaUrl = await saveMediaTemporarily(media);
      } catch (err) {
        logger.error('Failed to download media:', err);
      }
    }
    await handleIncomingMessage(message, mediaUrl);
  });
};

module.exports = { setupEvents };
```

### 5.5. Middleware Readiness (`src/middleware/readiness.js`)

```javascript
const { isReady } = require('../whatsapp/client');

const readinessMiddleware = (req, res, next) => {
  // Abaikan pengecekan untuk endpoint tertentu
  if (req.path === '/health' || req.path.startsWith('/api-docs')) {
    return next();
  }
  if (!isReady()) {
    return res.status(503).json({ status: 'error', message: 'WhatsApp client not ready yet' });
  }
  next();
};

module.exports = { readinessMiddleware };
```

### 5.6. Rate Limiting per IP dan API Key (`src/middleware/rateLimiter.js`)

```javascript
const rateLimit = require('express-rate-limit');

const keyGenerator = (req) => req.headers['x-api-key'] || req.ip;

const apiKeyLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  keyGenerator,
  message: { status: 'error', message: 'Too many requests for this API key' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { rateLimiter: apiKeyLimiter };
```

### 5.7. Autentikasi API Key (`src/middleware/auth.js`)

```javascript
const logger = require('../utils/logger');
const { UnauthorizedError } = require('../utils/errors');

const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    logger.warn(`Unauthorized access attempt from ${req.ip}`);
    return next(new UnauthorizedError());
  }
  next();
};

module.exports = { apiKeyAuth };
```

### 5.8. Validasi dengan Joi (`src/middleware/validator.js`)

Contoh untuk endpoint kirim pesan:

```javascript
const Joi = require('joi');
const { ValidationError } = require('../utils/errors');

const sendMessageSchema = Joi.object({
  to: Joi.string().required(),
  text: Joi.string().required(),
  quotedMessageId: Joi.string().allow(null).optional()
});

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) {
    return next(new ValidationError(error.details[0].message));
  }
  next();
};

module.exports = { validate, sendMessageSchema };
```

### 5.9. Custom Error Classes (`src/utils/errors.js`)

```javascript
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class WhatsAppError extends AppError {
  constructor(message) {
    super(message, 500);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

module.exports = { AppError, ValidationError, WhatsAppError, UnauthorizedError };
```

### 5.10. Global Error Handler (`src/middleware/errorHandler.js`)

```javascript
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  logger.error(`${err.name}: ${err.message}`, { stack: err.stack });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ status: 'error', message: err.message });
  }

  // Error tak terduga
  res.status(500).json({ status: 'error', message: 'Internal server error' });
};

module.exports = { errorHandler };
```

### 5.11. Formatter Nomor (`src/utils/formatter.js`)

```javascript
const formatPhoneNumber = (to) => {
  if (to.includes('@g.us') || to.includes('@c.us')) return to;
  // Hapus semua karakter non-digit
  const cleaned = to.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    // Ganti 0 dengan 62 (Indonesia) atau sesuaikan dengan kode negara default
    return `62${cleaned.substring(1)}@c.us`;
  }
  return `${cleaned}@c.us`; // asumsi sudah dengan kode negara
};

module.exports = { formatPhoneNumber };
```

### 5.12. Penanganan File Upload dan Pembersihan Otomatis (`src/utils/fileHandler.js`)

```javascript
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const cron = require('node-cron');

// Pastikan folder temp ada
const tempDir = path.join(__dirname, '../../temp');
const uploadDir = path.join(tempDir, 'uploads');
const mediaDir = path.join(tempDir, 'media');

[tempDir, uploadDir, mediaDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Konfigurasi multer untuk upload dari dashboard
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 } // 16 MB
});

// Simpan media dari pesan masuk
const saveMediaTemporarily = async (media) => {
  const ext = media.mimetype.split('/')[1] || 'bin';
  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  const filePath = path.join(mediaDir, filename);
  fs.writeFileSync(filePath, media.data, 'base64');
  const publicUrl = `${process.env.PUBLIC_URL}/temp/media/${filename}`;
  return publicUrl;
};

// Hapus file yang lebih dari `hours` jam
const cleanOldFiles = (hours = 1) => {
  const now = Date.now();
  [uploadDir, mediaDir].forEach(dir => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        logger.error('Error reading temp directory:', err);
        return;
      }
      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) {
            logger.error('Error stating file:', err);
            return;
          }
          const age = now - stats.mtimeMs;
          if (age > hours * 60 * 60 * 1000) {
            fs.unlink(filePath, (err) => {
              if (err) logger.error('Error deleting old file:', err);
              else logger.debug(`Deleted old temp file: ${file}`);
            });
          }
        });
      });
    });
  });
};

// Jadwalkan pembersihan setiap jam
cron.schedule('0 * * * *', () => {
  logger.info('Running scheduled temp file cleanup');
  cleanOldFiles(1);
});

module.exports = { upload, saveMediaTemporarily, cleanOldFiles };
```

### 5.13. Webhook Multi-URL dengan Media (`src/services/webhook.service.js`)

```javascript
const axios = require('axios');
const logger = require('../utils/logger');

// Mendapatkan daftar URL dari environment variable (JSON array)
const getWebhookUrls = () => {
  const envUrls = process.env.WEBHOOK_URLS || '[]';
  try {
    return JSON.parse(envUrls);
  } catch (err) {
    logger.warn('Failed to parse WEBHOOK_URLS, using empty array');
    return [];
  }
};

// Menyimpan URL tambahan secara dinamis
let dynamicUrls = [];

const addWebhookUrl = (url) => {
  if (!dynamicUrls.includes(url)) {
    dynamicUrls.push(url);
    logger.info(`Webhook URL added: ${url}`);
  }
};

const removeWebhookUrl = (url) => {
  dynamicUrls = dynamicUrls.filter(u => u !== url);
  logger.info(`Webhook URL removed: ${url}`);
};

const getAllWebhookUrls = () => {
  return [...new Set([...getWebhookUrls(), ...dynamicUrls])];
};

const handleIncomingMessage = async (message, mediaUrl = null) => {
  const urls = getAllWebhookUrls();
  if (urls.length === 0) return;

  const payload = {
    event: 'message',
    data: {
      id: message.id._serialized,
      from: message.from,
      body: message.body,
      type: message.type,
      timestamp: message.timestamp,
      hasMedia: message.hasMedia,
      mediaUrl: mediaUrl, // URL sementara jika ada
    }
  };

  await Promise.allSettled(urls.map(url =>
    axios.post(url, payload, { timeout: 5000 }).catch(err => {
      logger.error(`Failed to send webhook to ${url}: ${err.message}`);
    })
  ));
};

module.exports = { handleIncomingMessage, addWebhookUrl, removeWebhookUrl, getAllWebhookUrls };
```

### 5.14. Service WhatsApp (`src/services/whatsapp.service.js`)

```javascript
const { getClient } = require('../whatsapp/client');
const { formatPhoneNumber } = require('../utils/formatter');
const { MessageMedia } = require('whatsapp-web.js');
const { WhatsAppError } = require('../utils/errors');

const sendTextMessage = async (to, text, quotedMessageId = null) => {
  const client = getClient();
  const chatId = formatPhoneNumber(to);
  const options = quotedMessageId ? { quotedMessageId } : {};
  try {
    return await client.sendMessage(chatId, text, options);
  } catch (err) {
    if (err.message.includes('invalid number')) {
      throw new WhatsAppError('Nomor tidak valid');
    }
    throw new WhatsAppError('Gagal mengirim pesan: ' + err.message);
  }
};

const sendMediaMessage = async (to, filePath, caption = '', quotedMessageId = null) => {
  const client = getClient();
  const chatId = formatPhoneNumber(to);
  try {
    const media = MessageMedia.fromFilePath(filePath);
    const options = { caption, ...(quotedMessageId ? { quotedMessageId } : {}) };
    return await client.sendMessage(chatId, media, options);
  } catch (err) {
    throw new WhatsAppError('Gagal mengirim media: ' + err.message);
  }
};

// Fungsi lain: createGroup, getContacts, dll.

module.exports = { sendTextMessage, sendMediaMessage };
```

### 5.15. Contoh Controller (`src/controllers/messages.controller.js`)

```javascript
const { sendTextMessage } = require('../services/whatsapp.service');
const logger = require('../utils/logger');

const sendMessage = async (req, res, next) => {
  try {
    const { to, text, quotedMessageId } = req.body;
    const result = await sendTextMessage(to, text, quotedMessageId);
    res.json({ status: 'success', message: 'Message sent', id: result.id.id });
  } catch (err) {
    next(err);
  }
};

module.exports = { sendMessage };
```

### 5.16. (Opsional) Manajemen Multiple Account (`src/whatsapp/accountManager.js`)

```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('../utils/logger');
const { setupEvents } = require('./events');

const clients = new Map();

const createAccount = (accountId) => {
  if (clients.has(accountId)) return clients.get(accountId);
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: `./src/whatsapp/sessions/${accountId}` }),
    puppeteer: { args: process.env.PUPPETEER_ARGS?.split(',') }
  });
  setupEvents(client, (ready) => {
    // Bisa tambahkan logika per-account
  }, accountId);
  client.initialize();
  clients.set(accountId, client);
  return client;
};

const getClient = (accountId) => {
  if (!clients.has(accountId)) throw new Error(`Account ${accountId} not found`);
  return clients.get(accountId);
};

const removeAccount = (accountId) => {
  const client = clients.get(accountId);
  if (client) {
    client.destroy();
    clients.delete(accountId);
  }
};

module.exports = { createAccount, getClient, removeAccount };
```

Middleware pemilih akun (`middleware/accountSelector.js`):

```javascript
const { getClient } = require('../whatsapp/accountManager');

const accountSelector = (req, res, next) => {
  const accountId = req.headers['x-account-id'];
  if (!accountId) {
    return res.status(400).json({ status: 'error', message: 'X-Account-Id header required' });
  }
  try {
    req.whatsappClient = getClient(accountId);
    next();
  } catch (err) {
    res.status(404).json({ status: 'error', message: err.message });
  }
};

module.exports = { accountSelector };
```

---

## 📡 6. API Endpoints (Blueprint Lengkap)

Semua endpoint menggunakan prefix `/api/v1`. Autentikasi: `X-API-Key` di header.

### 6.1. Status
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET    | /status  | Mendapatkan status koneksi WhatsApp |

**Response (200):**
```json
{
  "status": "ok",
  "whatsapp_ready": true,
  "user": "Nama Pengguna",
  "phone": "628123456789@c.us"
}
```

### 6.2. Pesan
| Method | Endpoint          | Deskripsi |
|--------|-------------------|-----------|
| POST   | /messages         | Kirim pesan teks |
| POST   | /messages/:id/react | Beri reaksi pada pesan |

**POST /messages**  
Body:
```json
{
  "to": "628123456789",
  "text": "Halo",
  "quotedMessageId": null   // opsional
}
```

### 6.3. Media
| Method | Endpoint      | Deskripsi |
|--------|---------------|-----------|
| POST   | /media        | Kirim file (gambar, video, dokumen, audio) |
| POST   | /stickers     | Kirim stiker (dari gambar) |
| POST   | /location     | Kirim lokasi |
| POST   | /contact      | Kirim kontak |
| POST   | /polls        | Buat polling |

**POST /media** (multipart/form-data)
- `to`: nomor tujuan
- `file`: file yang diupload (maks 16MB)
- `caption`: teks caption (opsional)

### 6.4. Grup
| Method | Endpoint                               | Deskripsi |
|--------|----------------------------------------|-----------|
| POST   | /groups                                | Buat grup baru |
| GET    | /groups                                | Daftar grup yang diikuti |
| GET    | /groups/:id                            | Detail grup |
| PUT    | /groups/:id                            | Ubah nama/deskripsi grup |
| POST   | /groups/:id/participants               | Tambah peserta |
| DELETE | /groups/:id/participants/:participantId | Keluarkan peserta |
| PUT    | /groups/:id/participants/:participantId/promote | Jadikan admin |
| PUT    | /groups/:id/participants/:participantId/demote  | Hapus admin |
| GET    | /groups/:id/invite-code                 | Dapatkan link undangan |

**POST /groups**  
Body:
```json
{
  "title": "Nama Grup",
  "participants": ["628111222333@c.us", "628444555666@c.us"]
}
```

### 6.5. Kontak
| Method | Endpoint                       | Deskripsi |
|--------|--------------------------------|-----------|
| GET    | /contacts                      | Daftar semua kontak |
| GET    | /contacts/:number              | Detail kontak |
| GET    | /contacts/:number/profile-picture | Foto profil kontak |
| POST   | /contacts/:number/block        | Blokir kontak |
| POST   | /contacts/:number/unblock      | Buka blokir |
| GET    | /contacts/:number/is-registered | Cek apakah nomor terdaftar di WA |

### 6.6. Webhook
| Method | Endpoint       | Deskripsi |
|--------|----------------|-----------|
| POST   | /webhook       | Mendaftarkan URL webhook baru |
| DELETE | /webhook       | Hapus registrasi webhook (body: { "url": "..." }) |
| GET    | /webhook       | Mendapatkan daftar URL webhook yang terdaftar |

**POST /webhook**  
Body:
```json
{
  "url": "https://dashboard-php.example.com/whatsapp-webhook"
}
```

### 6.7. (Opsional) Multiple Account
| Method | Endpoint         | Deskripsi |
|--------|------------------|-----------|
| POST   | /accounts        | Buat akun baru (body: { "accountId": "nomor" }) |
| GET    | /accounts        | Daftar semua akun |
| DELETE | /accounts/:id    | Hapus akun |

---

## 🔐 7. Keamanan

- **API Key** wajib di setiap request (header `X-API-Key`).
- **Rate limiting**: maksimal 100 request per 15 menit per IP dan per API key (dapat disesuaikan di .env).
- **Validasi input** menggunakan Joi.
- **Helmet** untuk mengamankan header HTTP.
- **Environment variables** untuk menyimpan rahasia (jangan commit .env).
- **HTTPS** wajib jika API diakses dari internet (gunakan reverse proxy seperti Nginx dengan Let's Encrypt).
- **Pembersihan file temporary** otomatis setiap jam.

---

## 📝 8. Penanganan Error

Semua error dikembalikan dalam format JSON:
```json
{
  "status": "error",
  "message": "Deskripsi error"
}
```

Kode HTTP yang digunakan:
- `400` – Bad Request (kesalahan input)
- `401` – Unauthorized (API Key salah)
- `404` – Resource tidak ditemukan
- `429` – Too Many Requests (rate limit)
- `500` – Internal Server Error (error tidak terduga)
- `503` – Service Unavailable (client WhatsApp belum siap)

---

## 📊 9. Logging

Menggunakan **Winston** dengan konfigurasi:

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

module.exports = logger;
```

---

## 📖 10. Dokumentasi API dengan Swagger

Integrasi Swagger UI untuk dokumentasi interaktif.

**Konfigurasi** (`src/docs/swagger.js`):

```javascript
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp Gateway API',
      version: '1.0.0',
      description: 'API untuk mengirim dan menerima pesan WhatsApp',
    },
    servers: [
      { url: process.env.PUBLIC_URL || 'http://localhost:3000/api/v1', description: 'Server' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
  },
  apis: ['./src/routes/v1/*.js'],
};

module.exports = swaggerJsdoc(options);
```

**Akses**: `http://your-server:3000/api-docs`

---

## 🚀 11. Deployment

### 11.1. Deploy ke VPS (Ubuntu)

1. **Update system**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Install Node.js 18** (menggunakan NodeSource):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

3. **Clone proyek** dan install dependencies:
   ```bash
   git clone <repo-url> /opt/wa-gateway
   cd /opt/wa-gateway
   npm install
   ```

4. **Setup environment**:
   ```bash
   cp .env.example .env
   nano .env   # isi dengan nilai yang sesuai
   ```

5. **Install PM2 global**:
   ```bash
   sudo npm install -g pm2
   ```

6. **Jalankan dengan PM2**:
   ```bash
   pm2 start src/server.js --name wa-gateway
   pm2 save
   pm2 startup
   ```

7. **Konfigurasi reverse proxy Nginx** (untuk HTTPS dan domain):
   - Install Nginx: `sudo apt install nginx`
   - Buat konfigurasi di `/etc/nginx/sites-available/wa-gateway`:
     ```
     server {
         listen 80;
         server_name your-domain.com;

         location / {
             proxy_pass http://localhost:3000;
             proxy_http_version 1.1;
             proxy_set_header Upgrade $http_upgrade;
             proxy_set_header Connection 'upgrade';
             proxy_set_header Host $host;
             proxy_cache_bypass $http_upgrade;
             proxy_set_header X-Real-IP $remote_addr;
             proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
             proxy_set_header X-Forwarded-Proto $scheme;
         }
     }
     ```
   - Enable site: `sudo ln -s /etc/nginx/sites-available/wa-gateway /etc/nginx/sites-enabled/`
   - Test config: `sudo nginx -t`
   - Restart Nginx: `sudo systemctl restart nginx`
   - Install SSL dengan Certbot:
     ```bash
     sudo apt install certbot python3-certbot-nginx
     sudo certbot --nginx -d your-domain.com
     ```

### 11.2. Monitoring

- Pantau dengan `pm2 monit` atau `htop`.
- Integrasi dengan Sentry (opsional) untuk error tracking.
- Notifikasi Telegram untuk event penting (disconnect, auth failure) – lihat `utils/notifications.js`.

---

## 🧪 12. Testing

Gunakan **Jest** dan **Supertest**. Contoh test untuk endpoint `/messages`:

**`tests/messages.test.js`**:

```javascript
const request = require('supertest');
const app = require('../src/app');
jest.mock('whatsapp-web.js'); // mock library

describe('POST /api/v1/messages', () => {
  it('should return 401 without API key', async () => {
    const res = await request(app)
      .post('/api/v1/messages')
      .send({ to: '123', text: 'test' });
    expect(res.statusCode).toBe(401);
  });

  it('should return 400 if missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/messages')
      .set('X-API-Key', process.env.API_KEY)
      .send({ to: '123' });
    expect(res.statusCode).toBe(400);
  });
});
```

Mock library `whatsapp-web.js` di `__mocks__/whatsapp-web.js`:

```javascript
module.exports = {
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    initialize: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue({ id: { id: 'mock-id' } })
  })),
  LocalAuth: jest.fn(),
  MessageMedia: { fromFilePath: jest.fn() }
};
```

---

## 🆘 13. Troubleshooting Umum
| Masalah                          | Solusi |
|----------------------------------|--------|
| QR code tidak muncul             | Hapus folder `src/whatsapp/sessions/default` dan restart server. |
| Client sering disconnect         | Periksa koneksi internet; auto-reconnect sudah diimplementasikan. |
| Pesan gagal terkirim             | Pastikan nomor tujuan valid dan terdaftar di WhatsApp. |
| Error `Evaluation failed`        | Update library `whatsapp-web.js` ke versi terbaru. |
| API Key tidak dikenal            | Periksa header `X-API-Key` dan nilai di .env. |
| Port sudah digunakan             | Ubah PORT di .env. |
| Memory usage tinggi              | Kurangi argumen Puppeteer, tambah swap, atau restart periodik. |
| Webhook tidak terkirim           | Pastikan URL dapat diakses dari server, timeout diperpanjang. |

---

## 📦 14. Fitur Tambahan (Opsional)
- **Multiple account**: Sudah disediakan arsitektur dasar di `accountManager.js`.
- **Antrian pesan (queue)**: Gunakan Bull atau Bee-Queue untuk mengelola pengiriman massal.
- **Metric dan monitoring**: Ekspos endpoint `/metrics` untuk Prometheus.
- **Backup sesi**: Backup folder `sessions` secara berkala ke cloud storage.

---

## ✅ 15. Kesimpulan
Blueprint ini menyediakan panduan **lengkap, terstruktur, dan siap produksi** untuk membangun WhatsApp API Gateway. Dengan mengikuti langkah-langkah di atas, developer atau AI agent dapat mengimplementasikan sistem yang handal, aman, dan mudah dikembangkan lebih lanjut.