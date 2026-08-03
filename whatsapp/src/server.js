require('dotenv').config();
const http = require('http');
const app = require('./app');
const logger = require('./utils/logger');

// Catch uncaught exceptions and unhandled promise rejections to prevent process crashes on Windows file locks
process.on('uncaughtException', (err) => {
    logger.error('CRITICAL: Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const { initWhatsAppClient } = require('./whatsapp/client');
const { getSavedAccounts, saveAccount } = require('./utils/database');
const { restoreScheduledMessages } = require('./services/scheduledMessages.service');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);
const parseCorsOrigins = () => {
    const raw = process.env.CORS_ORIGIN || '';
    if (!raw.trim()) {
        return process.env.NODE_ENV === 'production' ? false : '*';
    }
    return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
};

// Inisialisasi WebSocket untuk real-time: QR code + chat history di dashboard
const io = new Server(server, {
    cors: {
        origin: parseCorsOrigins(),
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
});
global.io = io;

io.use((socket, next) => {
    const configuredKey = process.env.API_KEY;
    if (!configuredKey && process.env.NODE_ENV !== 'production') {
        return next();
    }

    const providedKey = socket.handshake.auth?.apiKey || socket.handshake.headers['x-api-key'];
    if (!configuredKey || providedKey !== configuredKey) {
        logger.warn(`[Socket] Unauthorized connection attempt: ${socket.id}`);
        return next(new Error('unauthorized'));
    }
    return next();
});

io.on('connection', (socket) => {
    logger.info(`[Socket] Client terhubung: ${socket.id}`);
    socket.on('disconnect', () => {
        logger.debug(`[Socket] Client terputus: ${socket.id}`);
    });
});

// Mulai server HTTP + WebSocket
server.on('error', (err) => {
    logger.error(`[HTTP Server Error]: ${err.message}`, { error: err });
    if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} sudah digunakan oleh proses lain (mungkin systemd service menettech-whatsapp). Keluar.`);
        process.exit(1);
    }
});

const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
server.listen(PORT, BIND_HOST, async () => {
    logger.info(`WhatsApp Gateway berjalan di http://${BIND_HOST}:${PORT}`);
    logger.info(`Swagger docs: http://${BIND_HOST}:${PORT}/api-docs`);

    try {
        // ── Restore semua akun yang tersimpan dari database ──────────────────
        const saved = getSavedAccounts();
        if (saved.length === 0) {
            // Tidak ada akun tersimpan → init akun default dan simpan ke DB
            logger.info('[Startup] Tidak ada akun tersimpan, inisialisasi akun "default"');
            saveAccount('default', 'Default Account');
            initWhatsAppClient('default');
        } else {
            logger.info(`[Startup] Memulihkan ${saved.length} akun dari database…`);
            for (let i = 0; i < saved.length; i++) {
                const acc = saved[i];
                try {
                    logger.info(`[Startup] Init akun: ${acc.id} (${acc.label})`);
                    initWhatsAppClient(acc.id);
                } catch (accErr) {
                    logger.error(`[Startup Error] Gagal memuat akun ${acc.id}: ${accErr.message}`);
                }
                
                // OPSEC / OOM Protection: Kasih jeda 20 detik jika ada akun berikutnya 
                // agar CPU & RAM Chromium tidak spike bersamaan (OOM kill) di VPS 512MB
                if (i < saved.length - 1) {
                    logger.info(`[Startup] Menunggu 20 detik sebelum memuat akun berikutnya untuk menghemat memori...`);
                    await new Promise(resolve => setTimeout(resolve, 20000));
                }
            }
        }

        restoreScheduledMessages();
    } catch (startupErr) {
        logger.error(`[Startup Error] Gagal memulihkan data saat startup: ${startupErr.message}`, { error: startupErr });
    }
});
