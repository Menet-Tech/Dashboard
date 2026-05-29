const cron = require('node-cron');
const { v4: uuidv4 } = require('crypto').webcrypto ?
    { v4: () => crypto.randomUUID() } :
    { v4: () => require('crypto').randomBytes(16).toString('hex') };
const logger = require('../utils/logger');
const { sendTextMessage } = require('./whatsapp.service');

// Map: id -> { id, to, text, scheduledAt (ISO string), cronJob, status }
const scheduledMessages = new Map();

/**
 * Buat pesan terjadwal baru
 * @param {string} accountId - ID klien pengirim
 * @param {string} to - nomor tujuan
 * @param {string} text - teks pesan
 * @param {object} config - konfigurasi jadwal
 */
const createScheduledMessage = (accountId, to, text, config) => {
    const id = require('crypto').randomBytes(8).toString('hex');
    let cronExpr = '';
    let description = '';
    let isRecurring = false;

    if (config.type === 'monthly') {
        // Format: setiap bulan pada tanggal 'day' jam 'time' (HH:mm)
        const [hour, minute] = config.time.split(':');
        cronExpr = `${minute} ${hour} ${config.day} * *`;
        description = `Setiap bulannya pada tanggal ${config.day} jam ${config.time}`;
        isRecurring = true;
    } else {
        // One-time format
        const sendAt = new Date(config.scheduledAt);
        if (isNaN(sendAt.getTime()) || sendAt <= new Date()) {
            throw new Error('Waktu harus berupa waktu di masa depan yang valid (ISO 8601)');
        }
        const minute = sendAt.getMinutes();
        const hour = sendAt.getHours();
        const day = sendAt.getDate();
        const month = sendAt.getMonth() + 1;
        cronExpr = `${minute} ${hour} ${day} ${month} *`;
        description = `Sekali jalan pada ${sendAt.toISOString()}`;
    }

    const job = cron.schedule(cronExpr, async () => {
        logger.info(`[Scheduled] Sending scheduled message ${id} to ${to} via ${accountId}`);
        try {
            await sendTextMessage(accountId, to, text);
            const entry = scheduledMessages.get(id);
            if (entry) {
                entry.status = isRecurring ? 'active' : 'sent';
                entry.lastSentAt = new Date().toISOString();
            }
            logger.info(`[Scheduled] Message ${id} sent successfully`);
        } catch (err) {
            logger.error(`[Scheduled] Failed to send message ${id}: ${err.message}`);
            const entry = scheduledMessages.get(id);
            if (entry && !isRecurring) entry.status = 'failed';
        }
        if (!isRecurring) job.stop();
    }, { timezone: 'Asia/Jakarta' });

    const entry = {
        id,
        accountId,
        to,
        text,
        type: config.type || 'once',
        description,
        status: isRecurring ? 'active' : 'pending',
        cronExpr,
        _job: job,
    };

    scheduledMessages.set(id, entry);
    logger.info(`[Scheduled] Message ${id} scheduled: ${description}`);
    return { id, to, text, description, type: entry.type, status: entry.status };
};

const getAllScheduledMessages = () => {
    return [...scheduledMessages.values()].map(({ _job, ...rest }) => rest);
};

const cancelScheduledMessage = (id) => {
    const entry = scheduledMessages.get(id);
    if (!entry) return null;
    entry._job.stop();
    entry.status = 'cancelled';
    scheduledMessages.delete(id);
    logger.info(`[Scheduled] Message ${id} cancelled`);
    return { id, status: 'cancelled' };
};

module.exports = { createScheduledMessage, getAllScheduledMessages, cancelScheduledMessage };
