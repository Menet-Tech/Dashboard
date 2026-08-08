const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    isJidBroadcast
} = require('@whiskeysockets/baileys');
const fs = require('fs/promises');
const path = require('path');
const pino = require('pino');
const logger = require('../utils/logger');
const { sendDiscordNotification } = require('../utils/discord');
const { setupEvents } = require('./events');

const clients = new Map();
const qrs = new Map();
const readyStatuses = new Map();
const reconnectTimers = new Map();

const sessionRoot = path.resolve(__dirname, 'sessions');

const assertSafeAccountId = (accountId) => {
    const idStr = String(accountId || '');
    if (!/^[a-zA-Z0-9._-]+$/.test(idStr)) {
        throw new Error('Account ID hanya boleh berisi huruf, angka, dot, underscore, dan dash');
    }
};

const resolveSessionPath = (accountId) => {
    const idStr = String(accountId || '');
    assertSafeAccountId(idStr);
    const target = path.resolve(sessionRoot, idStr);
    if (!target.startsWith(sessionRoot + path.sep) && target !== sessionRoot) {
        throw new Error('Invalid session path');
    }
    return target;
};

const initWhatsAppClient = async (accountId = 'default') => {
    assertSafeAccountId(accountId);
    if (clients.has(accountId)) return clients.get(accountId);

    logger.info(`Initializing Baileys client for account: ${accountId}`);
    const sessionDir = resolveSessionPath(accountId);
    
    // Pastikan direktori sesi ada
    await fs.mkdir(sessionDir, { recursive: true }).catch(() => {});

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`[${accountId}] Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const pinoLogger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        logger: pinoLogger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            // Cache keys for faster initial sync
            keys: makeCacheableSignalKeyStore(state.keys, pinoLogger),
        },
        generateHighQualityLinkPreview: true,
        shouldIgnoreJid: jid => isJidBroadcast(jid),
        browser: ['Menet-Tech Gateway', 'Chrome', '1.0.0'],
    });

    clients.set(accountId, sock);
    readyStatuses.set(accountId, false);

    if (global.io) {
        global.io.emit('account_status', { accountId, ready: false, hasQr: false });
    }

    sock.ev.process(async (events) => {
        if (events['connection.update']) {
            const update = events['connection.update'];
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                logger.info(`[${accountId}] QR Code received, scan with WhatsApp`);
                qrs.set(accountId, qr);
                if (global.io) {
                    global.io.emit('qr_code', { accountId, qr });
                    global.io.emit('account_status', { accountId, ready: false, hasQr: true });
                }
            }

            if (connection === 'close') {
                readyStatuses.set(accountId, false);
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                logger.warn(`[${accountId}] Connection closed due to: ${lastDisconnect?.error?.message}. Reconnecting: ${shouldReconnect}`);
                
                if (global.io) {
                    global.io.emit('account_status', { accountId, ready: false, hasQr: false });
                }

                if (shouldReconnect) {
                    scheduleReconnect(accountId);
                } else {
                    logger.warn(`[${accountId}] Logged out. Session deleted.`);
                    // Hapus file kredensial jika di-logout
                    await removeAccount(accountId);
                }
            }

            if (connection === 'open') {
                logger.info(`[${accountId}] WhatsApp client is ready!`);
                readyStatuses.set(accountId, true);
                qrs.delete(accountId);
                
                if (global.io) {
                    global.io.emit('account_status', { accountId, ready: true, hasQr: false });
                }
                sendDiscordNotification(`🚀 **[${accountId}]** WhatsApp Client is Ready & Online!`);
            }
        }

        if (events['creds.update']) {
            await saveCreds();
        }
    });

    // Pasang listener untuk pesan (AutoReply / AI / Webhook)
    setupEvents(sock, accountId);

    return sock;
};

const scheduleReconnect = (accountId) => {
    if (reconnectTimers.has(accountId)) {
        clearTimeout(reconnectTimers.get(accountId));
    }
    const delay = 5000;
    logger.info(`[${accountId}] Scheduling reconnect in ${delay}ms`);
    reconnectTimers.set(accountId, setTimeout(() => {
        clients.delete(accountId); // Clear old socket
        initWhatsAppClient(accountId).catch(e => logger.error(`[${accountId}] Reconnect failed: ${e.message}`));
    }, delay));
};

const getClient = (accountId) => clients.get(accountId);

const isReady = (accountId) => {
    if (!clients.has(accountId)) return false;
    return readyStatuses.get(accountId) === true;
};

const getQr = (accountId) => qrs.get(accountId) || null;

const getAllAccounts = () => {
    return Array.from(clients.keys()).map(id => ({
        accountId: id,
        ready: isReady(id),
        hasQr: qrs.has(id)
    }));
};

const removeAccount = async (accountId) => {
    const client = clients.get(accountId);
    if (client) {
        try {
            client.logout().catch(() => {});
        } catch(e) {}
        client.end(new Error('Manually removed'));
        clients.delete(accountId);
        readyStatuses.delete(accountId);
        qrs.delete(accountId);
        if (reconnectTimers.has(accountId)) {
            clearTimeout(reconnectTimers.get(accountId));
            reconnectTimers.delete(accountId);
        }
    }
    
    // Hapus file sesi
    try {
        const sessionPath = resolveSessionPath(accountId);
        await fs.rm(sessionPath, { recursive: true, force: true, maxRetries: 3 });
        logger.info(`[${accountId}] Session folder deleted`);
    } catch (err) {
        logger.error(`[${accountId}] Error removing session folder: ${err.message}`);
    }
    return true;
};

module.exports = {
    initWhatsAppClient,
    getClient,
    isReady,
    getQr,
    getAllAccounts,
    removeAccount,
    resolveSessionPath
};
