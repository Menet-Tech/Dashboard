const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger');
const { sendDiscordNotification } = require('../utils/discord');
const { setupEvents } = require('./events');

// Maps untuk mengelola multi-account
const clients = new Map();
const qrs = new Map();
const readyStatuses = new Map();
const reconnectTimers = new Map();

const sessionRoot = path.resolve(__dirname, 'sessions');

const assertSafeAccountId = (accountId) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(accountId)) {
        throw new Error('Account ID hanya boleh berisi huruf, angka, underscore, dan dash');
    }
};

const resolveSessionPath = (accountId) => {
    assertSafeAccountId(accountId);
    const target = path.resolve(sessionRoot, accountId);
    if (!target.startsWith(sessionRoot + path.sep) && target !== sessionRoot) {
        throw new Error('Invalid session path');
    }
    return target;
};

const cleanupSessionLocks = (accountId) => {
    try {
        const sessionDir = resolveSessionPath(accountId);
        const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
        for (const file of lockFiles) {
            try { fsSync.rmSync(path.join(sessionDir, file), { force: true }); } catch (e) {}
            try { fsSync.rmSync(path.join(sessionDir, 'session', file), { force: true }); } catch (e) {}
        }
    } catch (err) {
        logger.warn(`[${accountId}] Failed to clean up session locks: ${err.message}`);
    }
};

const resolveExecutablePath = () => {
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fsSync.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const commonPaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/lib/chromium-browser/chromium-browser',
        '/snap/bin/chromium'
    ];
    for (const p of commonPaths) {
        if (fsSync.existsSync(p)) {
            logger.info(`Using detected system Chromium: ${p}`);
            return p;
        }
    }
    try {
        const puppeteer = require('puppeteer');
        if (puppeteer && typeof puppeteer.executablePath === 'function') {
            const pPath = puppeteer.executablePath();
            if (pPath && fsSync.existsSync(pPath)) {
                logger.info(`Using Puppeteer cached browser: ${pPath}`);
                return pPath;
            }
        }
    } catch (e) {}
    return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
};

/**
 * Inisialisasi WhatsApp Client baru
 * @param {string} accountId 
 */
const initWhatsAppClient = (accountId = 'default') => {
    assertSafeAccountId(accountId);
    if (clients.has(accountId)) return clients.get(accountId);

    logger.info(`Initializing client for account: ${accountId}`);
    const defaultArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote'
    ];
    const customArgs = process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(',').map(a => a.trim()).filter(Boolean) : [];
    const mergedArgs = Array.from(new Set([...defaultArgs, ...customArgs]));

    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: resolveSessionPath(accountId)
        }),
        userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        authTimeoutMs: 300000,
        puppeteer: {
            executablePath: resolveExecutablePath(),
            args: mergedArgs
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
    cleanupSessionLocks(accountId);
    client.initialize().catch(async (err) => {
        const errMsg = err ? (err.stack || err.message || (typeof err === 'string' ? err : JSON.stringify(err))) : 'Unknown initialize error';
        logger.error(`[${accountId}] Failed to initialize client: ${errMsg}`, { error: err });
        readyStatuses.set(accountId, false);
        try { await client.destroy(); } catch (e) {}
        scheduleReconnect(accountId);
    });
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
    assertSafeAccountId(accountId);
    if (reconnectTimers.has(accountId)) {
        clearTimeout(reconnectTimers.get(accountId));
        reconnectTimers.delete(accountId);
    }
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

    try {
        await fs.rm(resolveSessionPath(accountId), { recursive: true, force: true });
    } catch (err) {
        logger.error(`Error removing session folder ${accountId}:`, err);
    }
    
    if (global.io) {
        global.io.emit('account_removed', { accountId });
    }
    sendDiscordNotification(`🗑️ **[${accountId}]** Akun WhatsApp telah dihapus.`);
    return true;
};

const scheduleReconnect = (accountId = 'default') => {
    if (reconnectTimers.has(accountId)) {
        logger.info(`[${accountId}] Reconnect already scheduled. Skipping duplicate scheduleReconnect.`);
        return;
    }
    logger.info(`Scheduling reconnect for ${accountId} in 10 seconds...`);
    const timer = setTimeout(async () => {
        reconnectTimers.delete(accountId);
        logger.info(`Attempting to reconnect ${accountId}...`);
        if (clients.has(accountId)) {
            const client = clients.get(accountId);
            clients.delete(accountId);
            readyStatuses.delete(accountId);
            qrs.delete(accountId);
            try {
                await client.destroy();
            } catch (err) {
                logger.warn(`[${accountId}] Error destroying client during reconnect: ${err.message}`);
            }
        }
        initWhatsAppClient(accountId);
    }, 10000);
    reconnectTimers.set(accountId, timer);
};

// Server.js will handle initialization

module.exports = { 
    initWhatsAppClient, 
    getClient, 
    isReady, 
    getQr, 
    getAllAccounts, 
    removeAccount, 
    scheduleReconnect,
    resolveSessionPath,
};
