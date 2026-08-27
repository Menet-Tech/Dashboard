const express = require('express');
const router  = express.Router();
const { getAllSessions, deleteSession, getForms, updateFormStatus, deleteForm, getGatewaySettings, setGatewaySetting, saveContactForm } = require('../../utils/database');

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
            chatbot_enabled: settings.chatbot_enabled || '1',
        },
    });
});

router.put('/settings', (req, res) => {
    const allowed = ['chatbot_account_id', 'auto_reply_account_id', 'auto_reply_before_chatbot', 'chatbot_enabled'];
    const result = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
            result[key] = setGatewaySetting(key, String(req.body[key] ?? '')).value;
        }
    }
    res.json({ status: 'success', message: 'Pengaturan chatbot diperbarui', data: result });
});

/**
 * POST /api/v1/chatbot/forms
 * Tambah contact form baru (untuk registrasi manual oleh admin)
 */
router.post('/forms', (req, res) => {
    const { type, phone, account_id, data } = req.body;
    if (!type || !phone) {
        return res.status(400).json({ status: 'error', message: 'Type and phone are required' });
    }
    const formId = saveContactForm(type, phone, account_id || 'manual', data || {});
    res.status(201).json({ status: 'success', message: 'Data form berhasil ditambahkan', data: { id: formId } });
});

/**
 * PATCH /api/v1/chatbot/forms/:id
 * Update status contact form (misal status = resolved)
 */
router.patch('/forms/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ status: 'error', message: 'Status is required' });
    }
    const updated = updateFormStatus(id, status);
    if (!updated) {
        return res.status(404).json({ status: 'error', message: 'Form not found' });
    }
    res.json({ status: 'success', message: 'Status form diperbarui', data: updated });
});

/**
 * DELETE /api/v1/chatbot/forms/:id
 * Hapus data contact form pendaftaran/support
 */
router.delete('/forms/:id', (req, res) => {
    const { id } = req.params;
    deleteForm(id);
    res.json({ status: 'success', message: 'Data form berhasil dihapus' });
});

/**
 * POST /api/v1/chatbot/sessions/:phone/resolve
 * Memberitahukan bahwa complaint telah diatasi, menghapus sesi WAITING_ADMIN, dan mengirimkan menu utama
 */
router.post('/sessions/:phone/resolve', async (req, res, next) => {
    try {
        const phone = decodeURIComponent(req.params.phone);
        const { accountId } = req.body;
        
        // Normalize: if it doesn't end with @s.whatsapp.net and doesn't contain @, append it
        const rawFrom = (phone.includes('@') || phone.endsWith('@s.whatsapp.net')) ? phone : `${phone}@s.whatsapp.net`;
        
        // 1. Delete chatbot session
        deleteSession(rawFrom);
        
        // 2. Send resolved message
        const { sendTextMessage } = require('../../services/whatsapp.service');
        const accId = accountId || 'default';
        await sendTextMessage(accId, rawFrom, "Complain Anda sudah diatasi.");
        
        // 3. Trigger main menu sending
        const { handleMessage } = require('../../services/chatbot.service');
        await handleMessage(rawFrom, '', accId, async (actId, to, text) => {
            await sendTextMessage(actId, to, text);
        });
        
        res.json({ status: 'success', message: `Complaint resolved and session reset for ${phone}` });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
