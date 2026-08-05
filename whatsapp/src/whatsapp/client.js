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

const cleanupSessionLocks = (accountId) => {
    try {
        const sessionDir = resolveSessionPath(accountId);
        const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
        for (const file of lockFiles) {
            try { fsSync.rmSync(path.join(sessionDir, file), { force: true }); } catch (e) { }
            try { fsSync.rmSync(path.join(sessionDir, 'session', file), { force: true }); } catch (e) { }
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
    } catch (e) { }
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
    cleanupSessionLocks(accountId);
    if (!process.env.DBUS_SESSION_BUS_ADDRESS) {
        delete process.env.DBUS_SESSION_BUS_ADDRESS;
    }
    const defaultArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        // NOTE: --disable-web-security DIHAPUS — flag ini mematikan same-origin policy
        // di dalam renderer Chromium, membuka celah RCE jika WhatsApp Web merender
        // konten berbahaya (payload XSS, gambar exploit, dsb.) langsung di server.
        // Low-memory flags for VPS
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-background-timer-throttling',
        '--disable-client-side-phishing-detection',
        '--disable-popup-blocking',
        '--disable-component-extensions-with-background-pages',
        '--disable-ipc-flooding-protection',
        '--js-flags=--max-old-space-size=128',
        '--renderer-process-limit=1',
        // Optimizations for faster loading
        '--blink-settings=imagesEnabled=false', // Disable images (saves huge bandwidth/CPU)
        '--disable-accelerated-2d-canvas',
        '--disable-accelerated-video-decode',
        '--disable-features=WebGL',
    ];

    const customArgs = process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(',').map(a => a.trim()).filter(Boolean) : [];
    const mergedArgs = Array.from(new Set([...defaultArgs, ...customArgs]));

    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: resolveSessionPath(accountId)
        }),
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        authTimeoutMs: 300000,
        puppeteer: {
            executablePath: resolveExecutablePath(),
            args: mergedArgs,
            timeout: 600000,
            protocolTimeout: 0
        }
    });

    readyStatuses.set(accountId, false);
    if (global.io) {
        global.io.emit('account_status', { accountId, ready: false, hasQr: false });
    }

    client.on('qr', (qr) => {
        logger.info(`[${accountId}] QR Code received, scan with WhatsApp`);
        if (process.env.ENABLE_DASHBOARD !== 'true') {
            try {
                qrcode.generate(qr, { small: true });
            } catch (e) {}
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

    client.on('disconnected', async (reason) => {
        if (!clients.has(accountId)) return; // Account was removed manually
        logger.warn(`[${accountId}] Client disconnected: ${reason}`);
        readyStatuses.set(accountId, false);
        qrs.delete(accountId);
        if (global.io) {
            global.io.emit('account_status', { accountId, ready: false, hasQr: false });
        }
        sendDiscordNotification(`⚠️ **[${accountId}]** WhatsApp Client Disconnected! Reason: ${reason}`);
        // Destroy client dengan timeout 5 detik agar tidak pernah hang selamanya
        // (mitigasi deadlock jika socket Puppeteer sudah crash tanpa exit code bersih)
        await destroyWithTimeout(client, accountId, 5000);
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
        await destroyWithTimeout(client, accountId, 5000);
        scheduleReconnect(accountId);
    });

    // Fallback DOM Scanner: ekstraksi QR langsung dari canvas Chromium jika event terhalang
    let domScanCount = 0;
    const domScanInterval = setInterval(async () => {
        domScanCount++;
        if (readyStatuses.get(accountId) || domScanCount > 30) {
            clearInterval(domScanInterval);
            return;
        }
        if (client && client.pupPage) {
            try {
                const qrRes = await client.pupPage.evaluate(() => {
                    const divRef = document.querySelector('div[data-ref]');
                    if (divRef) return divRef.getAttribute('data-ref');
                    const canvas = document.querySelector('canvas');
                    if (canvas && canvas.parentElement) {
                        return canvas.parentElement.getAttribute('data-ref');
                    }
                    return null;
                });
                
                if (qrRes && qrs.get(accountId) !== qrRes) {
                    logger.info(`[${accountId}] QR Code diperbarui via DOM Fallback Scanner!`);
                    qrs.set(accountId, qrRes);
                    if (global.io) {
                        global.io.emit('qr_code', { accountId, qr: qrRes });
                        global.io.emit('account_status', { accountId, ready: false, hasQr: true });
                    }
                    if (process.env.ENABLE_DASHBOARD !== 'true') {
                        try {
                            qrcode.generate(qrRes, { small: true });
                        } catch (e) {}
                    }
                }
            } catch (e) {
                // ignore transient errors during page load
            }
        }
    }, 2000);

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
        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
        logger.error(`Error destroying client ${accountId}:`, err);
    }

    try {
        await fs.rm(resolveSessionPath(accountId), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch (err) {
        logger.error(`Error removing session folder ${accountId}:`, err);
    }

    if (global.io) {
        global.io.emit('account_removed', { accountId });
    }
    sendDiscordNotification(`🗑️ **[${accountId}]** Akun WhatsApp telah dihapus.`);
    return true;
};

/**
 * Menghancurkan Puppeteer client dengan batas waktu (timeout) agar tidak
 * pernah hang selamanya jika browser sudah crash tanpa exit code yang bersih.
 * @param {import('whatsapp-web.js').Client} client
 * @param {string} accountId
 * @param {number} [timeoutMs=5000]
 */
const destroyWithTimeout = (client, accountId, timeoutMs = 5000) => {
    return Promise.race([
        client.destroy()
            .then(() => logger.info(`[${accountId}] Browser berhasil dihancurkan.`))
            .catch(e => logger.warn(`[${accountId}] Error saat destroy client: ${e.message}`)),
        new Promise(resolve => setTimeout(() => {
            logger.warn(`[${accountId}] destroy() melebihi batas waktu ${timeoutMs}ms — diabaikan, lanjut reconnect.`);
            resolve();
        }, timeoutMs))
    ]);
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
            await destroyWithTimeout(client, accountId, 5000);
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
