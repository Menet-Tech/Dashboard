const express = require('express');
const router  = express.Router();
const { getAllSessions, deleteSession, getForms, getGatewaySettings, setGatewaySetting } = require('../../utils/database');

/**
 * GET /api/v1/chatbot/sessions
 * Daftar sesi chatbot aktif — untuk monitoring di dashboard
 */
router.get('/sessions', (req, res) => {
    const sessions = getAllSessions();
    res.json({ status: 'success', count: sessions.length, data: sessions });
});

/**
 * DELETE /api/v1/chatbot/sessions/:phone
 * Reset sesi chatbot (paksa kembali ke IDLE)
 */
router.delete('/sessions/:phone', (req, res) => {
    const phone = decodeURIComponent(req.params.phone);
    deleteSession(phone);
    res.json({ status: 'success', message: `Sesi ${phone} direset` });
});

/**
 * GET /api/v1/chatbot/forms?type=registration|support
 * Lihat form yang masuk (pendaftaran / tiket support)
 */
router.get('/forms', (req, res) => {
    const { type, limit } = req.query;
    const forms = getForms(type || null, parseInt(limit, 10) || 50);
    res.json({ status: 'success', count: forms.length, data: forms });
});

router.get('/settings', (req, res) => {
    const settings = getGatewaySettings();
    res.json({
        status: 'success',
        data: {
            chatbot_account_id: settings.chatbot_account_id || '*',
            auto_reply_account_id: settings.auto_reply_account_id || '*',
            auto_reply_before_chatbot: settings.auto_reply_before_chatbot || '1',
        },
    });
});

router.put('/settings', (req, res) => {
    const allowed = ['chatbot_account_id', 'auto_reply_account_id', 'auto_reply_before_chatbot'];
    const result = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
            result[key] = setGatewaySetting(key, String(req.body[key] ?? '')).value;
        }
    }
    res.json({ status: 'success', message: 'Pengaturan chatbot diperbarui', data: result });
});

module.exports = router;
