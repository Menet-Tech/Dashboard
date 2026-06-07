/**
 * isp.service.js
 * Adapter HTTP ke Go backend Menet Dashboard.
 * Chatbot menggunakan service ini untuk lookup data pelanggan, tagihan, dan paket.
 */
const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = (process.env.DASHBOARD_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const API_KEY  = process.env.DASHBOARD_INTERNAL_API_KEY || '';

/** Buat axios instance dengan base URL & optional auth header */
const client = axios.create({
    baseURL: BASE_URL,
    timeout: 8000,
    headers: API_KEY ? { 'X-Internal-Key': API_KEY } : {},
});

/**
 * Cari pelanggan berdasarkan nomor WA.
 * Nomor yang dikirim WhatsApp biasanya format "6281xxxxxxxx@c.us",
 * kita strip "@c.us" dan pakai nomor rawnya.
 * @param {string} rawPhone  — misal "6281234567890@c.us"
 * @returns {object|null}    — data pelanggan atau null jika tidak terdaftar
 */
const findCustomerByPhone = async (rawPhone) => {
    const phone = rawPhone.replace(/@c\.us$/, '').replace(/^0/, '62');
    try {
        const res = await client.get('/api/v1/customers', { params: { wa_number: phone, limit: 1 } });
        const data = res.data?.data;
        if (Array.isArray(data) && data.length > 0) return data[0];
        return null;
    } catch (err) {
        logger.error(`[ISP] findCustomerByPhone failed for ${phone}:`, err.message);
        return null;
    }
};

/**
 * Cek tagihan aktif (belum_bayar) pelanggan untuk bulan ini.
 * @param {number} customerId
 * @returns {object|null}
 */
const getActiveBill = async (customerId) => {
    try {
        const res = await client.get('/api/v1/bills', {
            params: { customer_id: customerId, status: 'belum_bayar', limit: 1 },
        });
        const data = res.data?.data;
        if (Array.isArray(data) && data.length > 0) return data[0];
        return null;
    } catch (err) {
        logger.error(`[ISP] getActiveBill failed for customer ${customerId}:`, err.message);
        return null;
    }
};

/**
 * Ambil daftar paket internet yang tersedia.
 * @returns {Array<{name, speed_mbps, price}>}
 */
const getPackageList = async () => {
    try {
        const res = await client.get('/api/v1/packages', { params: { limit: 20 } });
        return res.data?.data ?? [];
    } catch (err) {
        logger.error('[ISP] getPackageList failed:', err.message);
        return [];
    }
};

const notifyAdminViaWA = async (info, sendFn, customMsg = null) => {
    const adminNumbers = (process.env.ADMIN_WA_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean);
    const cleanPhone = info.phone.replace(/@c\.us$/, '').replace(/^\+/, '');
    const linkNumber = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.replace(/^0/, '');
    const msg = customMsg ||
`WOI, ada yang chat ke admin nih
Nomer : ${cleanPhone}
Nama kontak : ${info.contactName || '(tidak diketahui)'}
wa.me/+${linkNumber}
GC GANTI NOMER KE SINI`;

    for (const admin of adminNumbers) {
        try {
            await sendFn(info.accountId, admin, msg);
        } catch (err) {
            logger.warn(`[ISP] notifyAdmin failed to ${admin}:`, err.message);
        }
    }
};

const notifyAdminViaDiscord = async (info, customMsg = null) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;
    const cleanPhone = info.phone.replace(/@c\.us$/, '').replace(/^\+/, '');
    const linkNumber = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.replace(/^0/, '');
    const mention = process.env.DISCORD_ADMIN_ROLE_ID ? `<@&${process.env.DISCORD_ADMIN_ROLE_ID}>` : '@everyone';
    const content = customMsg ? `${mention}\n${customMsg}` :
`${mention}
WOI, ada yang chat ke admin nih
Nomer : ${cleanPhone}
Nama kontak : ${info.contactName || '(tidak diketahui)'}
wa.me/+${linkNumber}
GC GANTI NOMER KE SINI`;

    try {
        await client.post(webhookUrl, { content }, { baseURL: '' });
    } catch (err) {
        logger.warn('[ISP] notifyAdminViaDiscord failed:', err.message);
    }
};

const createTicket = async (data) => {
    try {
        const res = await client.post('/api/v1/tickets', data);
        return res.data?.data ?? null;
    } catch (err) {
        logger.error('[ISP] createTicket failed:', err.message);
        return null;
    }
};

const getTemplateByTrigger = async (triggerKey) => {
    try {
        const res = await client.get('/api/v1/templates');
        const data = res.data?.data;
        if (Array.isArray(data)) {
            const found = data.find(t => t.trigger_key === triggerKey && t.is_active);
            return found ?? null;
        }
        return null;
    } catch (err) {
        logger.error(`[ISP] getTemplateByTrigger failed for ${triggerKey}:`, err.message);
        return null;
    }
};

const getSettings = async () => {
    try {
        const res = await client.get('/api/v1/settings');
        return res.data?.data ?? {};
    } catch (err) {
        logger.error('[ISP] getSettings failed:', err.message);
        return {};
    }
};

module.exports = {
    findCustomerByPhone,
    getActiveBill,
    getPackageList,
    notifyAdminViaWA,
    notifyAdminViaDiscord,
    createTicket,
    getTemplateByTrigger,
    getSettings,
};
