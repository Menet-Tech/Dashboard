const { initWhatsAppClient, getAllAccounts, removeAccount: destroyClient, getQr, isReady, getClient } = require('../whatsapp/client');
const { saveAccount, removeAccount: removeAccountDb, getSavedAccounts } = require('../utils/database');

const postCreateAccount = (req, res, next) => {
    try {
        const accountId = String(req.body.accountId || req.body.name || req.body.id || 'default');
        const label = String(req.body.label || req.body.name || accountId);

        // Simpan ke DB supaya persisten antar restart
        saveAccount(accountId, label);
        initWhatsAppClient(accountId);

        res.json({ status: 'success', message: `Inisialisasi akun '${accountId}' dimulai` });
    } catch (err) {
        next(err);
    }
};

const getAccounts = (req, res, next) => {
    try {
        const accounts = getAllAccounts();
        res.json({ status: 'success', count: accounts.length, data: accounts });
    } catch (err) {
        next(err);
    }
};

const deleteAccount = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await destroyClient(id);
        if (!result) return res.status(404).json({ status: 'error', message: 'Account not found' });

        // Hapus dari DB
        removeAccountDb(id);

        res.json({ status: 'success', message: `Akun '${id}' berhasil dihapus` });
    } catch (err) {
        next(err);
    }
};

const getAccountQr = (req, res, next) => {
    try {
        const { id } = req.params;
        const qr = getQr(id);
        if (!qr) return res.status(404).json({ status: 'error', message: 'QR Code belum tersedia atau akun sudah siap' });
        res.json({ status: 'success', data: { qr } });
    } catch (err) {
        next(err);
    }
};

/** GET /api/v1/status — untuk integration check dari Go backend */
const getStatus = (req, res, next) => {
    try {
        // Jika ada X-Account-Id spesifik, cek akun itu saja
        const accountId = req.headers['x-account-id'] || 'default';
        const accounts  = getAllAccounts();
        const target    = accounts.find(a => a.accountId === accountId);
        const ready     = target ? target.ready : false;
        res.json({
            status: 'success',
            whatsapp_ready: ready,
            accounts: accounts.length,
        });
    } catch (err) {
        next(err);
    }
};

const getPairingCode = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ status: 'error', message: 'Nomor telepon diperlukan (phoneNumber)' });
        }
        
        const client = getClient(id);
        if (isReady(id)) {
            return res.status(400).json({ status: 'error', message: 'Akun WhatsApp sudah siap (ready)' });
        }
        
        // Remove +, spaces, dashes, etc
        const cleanPhone = String(phoneNumber).replace(/\D/g, '');
        const code = await client.requestPairingCode(cleanPhone);
        res.json({ status: 'success', data: { code } });
    } catch (err) {
        next(err);
    }
};

module.exports = { postCreateAccount, getAccounts, deleteAccount, getAccountQr, getStatus, getPairingCode };
