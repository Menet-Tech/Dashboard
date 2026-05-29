require('dotenv').config();
const http = require('http');
const app = require('./app');
const logger = require('./utils/logger');
const { initWhatsAppClient } = require('./whatsapp/client');
const { getSavedAccounts } = require('./utils/database');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// Inisialisasi WebSocket untuk real-time: QR code + chat history di dashboard
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
});
global.io = io;

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
        // Tidak ada akun tersimpan → init akun default
        logger.info('[Startup] Tidak ada akun tersimpan, inisialisasi akun "default"');
        initWhatsAppClient('default');
    } else {
        logger.info(`[Startup] Memulihkan ${saved.length} akun dari database…`);
        for (const acc of saved) {
            logger.info(`[Startup] Init akun: ${acc.id} (${acc.label})`);
            initWhatsAppClient(acc.id);
        }
    }
});
