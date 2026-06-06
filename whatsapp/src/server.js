require('dotenv').config();
const http = require('http');
const app = require('./app');
const logger = require('./utils/logger');
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
server.listen(PORT, () => {
    logger.info(`WhatsApp Gateway berjalan di port ${PORT}`);
    logger.info(`Swagger docs: http://localhost:${PORT}/api-docs`);

    // ── Restore semua akun yang tersimpan dari database ──────────────────
    const saved = getSavedAccounts();
    if (saved.length === 0) {
        // Tidak ada akun tersimpan → init akun default dan simpan ke DB
        logger.info('[Startup] Tidak ada akun tersimpan, inisialisasi akun "default"');
        saveAccount('default', 'Default Account');
        initWhatsAppClient('default');
    } else {
        logger.info(`[Startup] Memulihkan ${saved.length} akun dari database…`);
        for (const acc of saved) {
            logger.info(`[Startup] Init akun: ${acc.id} (${acc.label})`);
            initWhatsAppClient(acc.id);
        }
    }

    restoreScheduledMessages();
});
