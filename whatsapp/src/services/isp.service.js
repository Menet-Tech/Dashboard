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

/**
 * Kirim notifikasi ke nomor-nomor admin via WhatsApp gateway sendiri
 * (dipanggil dari chatbot.service setelah client kirim "5" = minta chat admin)
 * @param {object} info  — { phone, contactName, accountId }
 * @param {Function} sendFn  — fungsi sendTextMessage dari whatsapp.service
 */
const notifyAdminViaWA = async (info, sendFn) => {
    const adminNumbers = (process.env.ADMIN_WA_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean);
    const msg =
`🔔 *Ada yang minta chat ke admin!*
Nomor : ${info.phone}
Nama  : ${info.contactName || '(tidak diketahui)'}
Link  : wa.me/${info.phone.replace(/@c\.us$/, '')}`;

    for (const admin of adminNumbers) {
        try {
            await sendFn(info.accountId, admin, msg);
        } catch (err) {
            logger.warn(`[ISP] notifyAdmin failed to ${admin}:`, err.message);
        }
    }
};

/**
 * Kirim notifikasi ke Discord webhook.
 * @param {object} info  — { phone, contactName }
 */
const notifyAdminViaDiscord = async (info) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;
    const mention = process.env.DISCORD_ADMIN_ROLE_ID ? `<@&${process.env.DISCORD_ADMIN_ROLE_ID}>` : '@everyone';
    const content =
`${mention}
🔔 **WOI, ada yang chat ke admin nih!**
Nomor : \`${info.phone.replace(/@c\.us$/, '')}\`
Nama  : ${info.contactName || '(tidak diketahui)'}
Link  : https://wa.me/${info.phone.replace(/@c\.us$/, '')}`;

    try {
        await client.post(webhookUrl, { content }, { baseURL: '' });
    } catch (err) {
        logger.warn('[ISP] notifyAdminViaDiscord failed:', err.message);
    }
};

module.exports = {
    findCustomerByPhone,
    getActiveBill,
    getPackageList,
    notifyAdminViaWA,
    notifyAdminViaDiscord,
};
