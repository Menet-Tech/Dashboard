const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger');
const { sendDiscordNotification } = require('../utils/discord');
const { setupEvents } = require('./events');

// Maps untuk mengelola multi-account
const clients = new Map();
const qrs = new Map();
const readyStatuses = new Map();

/**
 * Inisialisasi WhatsApp Client baru
 * @param {string} accountId 
 */
const initWhatsAppClient = (accountId = 'default') => {
    if (clients.has(accountId)) return clients.get(accountId);

    logger.info(`Initializing client for account: ${accountId}`);
    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: `./src/whatsapp/sessions/${accountId}`
        }),
        puppeteer: {
            args: process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(',') : ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    readyStatuses.set(accountId, false);
    if (global.io) {
        global.io.emit('account_status', { accountId, ready: false, hasQr: false });
    }

    client.on('qr', (qr) => {
        logger.info(`[${accountId}] QR Code received, scan with WhatsApp`);
        if (process.env.ENABLE_DASHBOARD !== 'true') {
            qrcode.generate(qr, { small: true }); 
        }
        qrs.set(accountId, qr);
        if (global.io) {
            global.io.emit('qr_code', { accountId, qr });
            global.io.emit('account_status', { accountId, ready: false, hasQr: true });
        }
        sendDiscordNotification(`📲 **[${accountId}]** Menunggu Scan QR Code. Silakan periksa dashboard atau terminal.`);
    });

    client.on('authenticated', () => {
        logger.info(`[${accountId}] WhatsApp authenticated`);
        qrs.delete(accountId);
        if (global.io) {
            global.io.emit('account_status', { accountId, ready: false, hasQr: false });
        }
        sendDiscordNotification(`✅ **[${accountId}]** WhatsApp Authenticated!`);
    });

    client.on('ready', () => {
        logger.info(`[${accountId}] WhatsApp client is ready!`);
        readyStatuses.set(accountId, true);
        qrs.delete(accountId); // Hapus QR setelah ready
        if (global.io) {
            global.io.emit('account_status', { accountId, ready: true, hasQr: false });
        }
        sendDiscordNotification(`🚀 **[${accountId}]** WhatsApp Client is Ready & Online!`);
    });

    client.on('disconnected', (reason) => {
        if (!clients.has(accountId)) return; // Account was removed manually
        logger.warn(`[${accountId}] Client disconnected: ${reason}`);
        readyStatuses.set(accountId, false);
        if (global.io) {
            global.io.emit('account_status', { accountId, ready: false, hasQr: false });
        }
        sendDiscordNotification(`⚠️ **[${accountId}]** WhatsApp Client Disconnected! Reason: ${reason}`);
        scheduleReconnect(accountId);
    });

    // Pasang listener untuk menerima pesan (AutoReply / AI / Webhook)
    setupEvents(client, accountId);

    logger.info(`[${accountId}] Sedang mencoba menghubungi peladen WhatsApp (membuka browser). Mohon tunggu...`);
    client.initialize();
    clients.set(accountId, client);
    return client;
};

/**
 * Mendapatkan instance Client berdasarkan accountId
 */
const getClient = (accountId = 'default') => {
    if (!clients.has(accountId)) throw new Error(`WhatsApp client for account '${accountId}' not initialized or not found`);
    return clients.get(accountId);
};

const isReady = (accountId = 'default') => !!readyStatuses.get(accountId);

const getQr = (accountId = 'default') => qrs.get(accountId) || null;

const getAllAccounts = () => {
    return Array.from(clients.keys()).map(id => ({
        accountId: id,
        ready: isReady(id),
        hasQr: !!getQr(id)
    }));
};

const removeAccount = async (accountId) => {
    if (!clients.has(accountId)) return false;
    const client = clients.get(accountId);
    
    // Hapus duluan dari memory supaya disconnected-event tahu bahwa ini dihapus manual
    clients.delete(accountId);
    readyStatuses.delete(accountId);
    qrs.delete(accountId);

    try {
        await client.destroy();
    } catch (err) {
        logger.error(`Error destroying client ${accountId}:`, err);
    }
    
    if (global.io) {
        global.io.emit('account_removed', { accountId });
    }
    sendDiscordNotification(`🗑️ **[${accountId}]** Akun WhatsApp telah dihapus.`);
    return true;
};

const scheduleReconnect = (accountId = 'default') => {
    logger.info(`Scheduling reconnect for ${accountId} in 10 seconds...`);
    setTimeout(async () => {
        logger.info(`Attempting to reconnect ${accountId}...`);
        await removeAccount(accountId);
        initWhatsAppClient(accountId);
    }, 10000);
};

// Server.js will handle initialization

module.exports = { 
    initWhatsAppClient, 
    getClient, 
    isReady, 
    getQr, 
    getAllAccounts, 
    removeAccount, 
    scheduleReconnect 
};
