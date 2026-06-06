const cron = require('node-cron');
const logger = require('../utils/logger');
const { sendTextMessage } = require('./whatsapp.service');
const {
    saveScheduledMessage,
    updateScheduledMessage,
    listScheduledMessages,
    listActiveScheduledMessages,
} = require('../utils/database');

// Runtime jobs live in memory, schedule metadata lives in SQLite.
const scheduledJobs = new Map();

const buildSchedule = (config = {}) => {
    const type = config.type || 'once';
    if (!['once', 'monthly'].includes(type)) {
        throw new Error('Tipe jadwal harus once atau monthly');
    }

    if (type === 'monthly') {
        const day = Number(config.day);
        const time = String(config.time || '').trim();
        if (!Number.isInteger(day) || day < 1 || day > 28) {
            throw new Error('Tanggal jadwal bulanan harus angka 1-28 agar aman di semua bulan');
        }
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
            throw new Error('Jam jadwal bulanan harus format HH:mm');
        }

        const [hour, minute] = time.split(':');
        const cronExpr = `${minute} ${hour} ${day} * *`;
        if (!cron.validate(cronExpr)) {
            throw new Error('Ekspresi cron jadwal bulanan tidak valid');
        }

        return {
            type,
            day,
            time,
            scheduledAt: null,
            cronExpr,
            description: `Setiap bulannya pada tanggal ${day} jam ${time}`,
            initialStatus: 'active',
        };
    }

    const sendAt = new Date(config.scheduledAt);
    if (Number.isNaN(sendAt.getTime()) || sendAt <= new Date()) {
        throw new Error('Waktu harus berupa waktu di masa depan yang valid (ISO 8601)');
    }

    const cronExpr = `${sendAt.getMinutes()} ${sendAt.getHours()} ${sendAt.getDate()} ${sendAt.getMonth() + 1} *`;
    if (!cron.validate(cronExpr)) {
        throw new Error('Ekspresi cron jadwal sekali jalan tidak valid');
    }

    return {
        type,
        day: null,
        time: null,
        scheduledAt: sendAt.toISOString(),
        cronExpr,
        description: `Sekali jalan pada ${sendAt.toISOString()}`,
        initialStatus: 'pending',
    };
};

const publicEntry = (entry) => ({
    id: entry.id,
    accountId: entry.accountId,
    to: entry.to,
    text: entry.text,
    type: entry.type,
    scheduledAt: entry.scheduledAt,
    day: entry.day,
    time: entry.time,
    description: entry.description,
    status: entry.status,
    cronExpr: entry.cronExpr,
    lastSentAt: entry.lastSentAt,
});

const registerJob = (entry) => {
    if (scheduledJobs.has(entry.id)) {
        scheduledJobs.get(entry.id).stop();
        scheduledJobs.delete(entry.id);
    }

    const isRecurring = entry.type === 'monthly';
    const job = cron.schedule(entry.cronExpr, async () => {
        logger.info(`[Scheduled] Sending scheduled message ${entry.id} to ${entry.to} via ${entry.accountId}`);
        try {
            await sendTextMessage(entry.accountId, entry.to, entry.text);
            updateScheduledMessage(entry.id, {
                status: isRecurring ? 'active' : 'sent',
                lastSentAt: new Date().toISOString(),
            });
            logger.info(`[Scheduled] Message ${entry.id} sent successfully`);
        } catch (err) {
            logger.error(`[Scheduled] Failed to send message ${entry.id}: ${err.message}`);
            updateScheduledMessage(entry.id, { status: isRecurring ? 'active' : 'failed' });
        }

        if (!isRecurring) {
            job.stop();
            scheduledJobs.delete(entry.id);
        }
    }, { timezone: 'Asia/Jakarta' });

    scheduledJobs.set(entry.id, job);
};

const createScheduledMessage = (accountId, to, text, config) => {
    const schedule = buildSchedule(config);
    const id = require('crypto').randomBytes(8).toString('hex');
    const entry = {
        id,
        accountId,
        to,
        text,
        type: schedule.type,
        scheduledAt: schedule.scheduledAt,
        day: schedule.day,
        time: schedule.time,
        description: schedule.description,
        status: schedule.initialStatus,
        cronExpr: schedule.cronExpr,
    };

    const saved = saveScheduledMessage(entry);
    registerJob(saved);
    logger.info(`[Scheduled] Message ${id} scheduled: ${saved.description}`);
    return publicEntry(saved);
};

const getAllScheduledMessages = () => listScheduledMessages().map(publicEntry);

const cancelScheduledMessage = (id) => {
    const job = scheduledJobs.get(id);
    if (job) {
        job.stop();
        scheduledJobs.delete(id);
    }

    const entry = updateScheduledMessage(id, { status: 'cancelled' });
    if (!entry) return null;
    logger.info(`[Scheduled] Message ${id} cancelled`);
    return publicEntry(entry);
};

const restoreScheduledMessages = () => {
    const entries = listActiveScheduledMessages();
    let restored = 0;
    for (const entry of entries) {
        try {
            if (entry.type === 'once' && entry.scheduledAt && new Date(entry.scheduledAt) <= new Date()) {
                updateScheduledMessage(entry.id, { status: 'failed' });
                continue;
            }
            registerJob(entry);
            restored += 1;
        } catch (err) {
            logger.error(`[Scheduled] Failed to restore schedule ${entry.id}: ${err.message}`);
            updateScheduledMessage(entry.id, { status: 'failed' });
        }
    }
    logger.info(`[Scheduled] Restored ${restored} active schedules`);
    return restored;
};

module.exports = {
    buildSchedule,
    createScheduledMessage,
    getAllScheduledMessages,
    cancelScheduledMessage,
    restoreScheduledMessages,
};
