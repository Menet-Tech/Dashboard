const { createScheduledMessage, getAllScheduledMessages, cancelScheduledMessage } = require('../services/scheduledMessages.service');

const scheduleMessage = (req, res, next) => {
    try {
        const { to, text, type, scheduledAt, day, time } = req.body;
        if (!to || !text) {
            return res.status(400).json({ status: 'error', message: 'Field to dan text wajib diisi' });
        }
        
        let config = { type: type || 'once' };
        if (config.type === 'monthly') {
            if (!day || !time) return res.status(400).json({ status: 'error', message: 'Untuk tipe monthly, day dan time wajib diisi' });
            config.day = day;
            config.time = time;
        } else {
            if (!scheduledAt) return res.status(400).json({ status: 'error', message: 'Field scheduledAt wajib diisi untuk tipe once' });
            config.scheduledAt = scheduledAt;
        }

        const result = createScheduledMessage(req.accountId, to, text, config);
        res.json({ status: 'success', message: 'Pesan berhasil dijadwalkan', data: result });
    } catch (err) {
        next(err);
    }
};

const listScheduled = (req, res) => {
    const list = getAllScheduledMessages();
    res.json({ status: 'success', count: list.length, data: list });
};

const cancelScheduled = (req, res, next) => {
    try {
        const result = cancelScheduledMessage(req.params.id);
        if (!result) return res.status(404).json({ status: 'error', message: 'Pesan terjadwal tidak ditemukan' });
        res.json({ status: 'success', message: 'Pesan terjadwal dibatalkan', data: result });
    } catch (err) {
        next(err);
    }
};

module.exports = { scheduleMessage, listScheduled, cancelScheduled };
