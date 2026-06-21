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

// In-memory cache variables (60-second TTL)
let settingsCache = null;
let settingsCacheTime = 0;

let templatesCache = null;
let templatesCacheTime = 0;

let packagesCache = null;
let packagesCacheTime = 0;

/**
 * Cari pelanggan berdasarkan nomor WA.
 * Nomor yang dikirim WhatsApp biasanya format "6281xxxxxxxx@c.us",
 * kita strip "@c.us" dan pakai nomor rawnya.
 * @param {string} rawPhone  — misal "6281234567890@c.us"
 * @returns {object|null}    — data pelanggan atau null jika tidak terdaftar
 */
const findCustomerByPhone = async (rawPhone) => {
    const phone = rawPhone.replace(/@(c\.us|lid)$/, '').replace(/^0/, '62');
    try {
        const res = await client.get('/api/v1/customers', { params: { wa_number: phone, limit: 1 } });
        const data = res.data?.data;
        if (Array.isArray(data) && data.length > 0) return data[0];
        return null;
    } catch (err) {
        logger.error(`[ISP] findCustomerByPhone failed for ${phone}: ${err.message}`);
        return null;
    }
};

const findCustomersByPhone = async (rawPhone) => {
    const phone = rawPhone.replace(/@(c\.us|lid)$/, '').replace(/^0/, '62');
    try {
        const res = await client.get('/api/v1/customers', { params: { wa_number: phone } });
        const data = res.data?.data;
        if (Array.isArray(data)) return data;
        return [];
    } catch (err) {
        logger.error(`[ISP] findCustomersByPhone failed for ${phone}: ${err.message}`);
        return [];
    }
};

const findCustomerByID = async (id) => {
    try {
        const res = await client.get(`/api/v1/customers/${id}`);
        return res.data?.data ?? null;
    } catch (err) {
        logger.error(`[ISP] findCustomerByID failed for ${id}:`, err.message);
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
 * Ambil daftar paket internet yang tersedia (dengan in-memory caching 1 menit).
 * @returns {Array<{name, speed_mbps, price}>}
 */
const getPackageList = async () => {
    const now = Date.now();
    if (packagesCache && (now - packagesCacheTime < 60000)) {
        return packagesCache;
    }
    try {
        const res = await client.get('/api/v1/packages', { params: { limit: 20 } });
        packagesCache = res.data?.data ?? [];
        packagesCacheTime = now;
        return packagesCache;
    } catch (err) {
        logger.error('[ISP] getPackageList failed:', err.message);
        return packagesCache || [];
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

const getAllTemplates = async () => {
    const now = Date.now();
    if (!templatesCache || (now - templatesCacheTime > 60000)) {
        try {
            const res = await client.get('/api/v1/templates');
            templatesCache = res.data?.data ?? [];
            templatesCacheTime = now;
        } catch (err) {
            logger.error(`[ISP] fetch templates failed:`, err.message);
            if (!templatesCache) {
                templatesCache = [];
            }
        }
    }
    return templatesCache;
};

const getTemplateByTrigger = async (triggerKey) => {
    const now = Date.now();
    if (!templatesCache || (now - templatesCacheTime > 60000)) {
        try {
            const res = await client.get('/api/v1/templates');
            templatesCache = res.data?.data ?? [];
            templatesCacheTime = now;
        } catch (err) {
            logger.error(`[ISP] fetch templates failed:`, err.message);
            if (!templatesCache) {
                templatesCache = [];
            }
        }
    }
    if (Array.isArray(templatesCache)) {
        const found = templatesCache.find(t => t.trigger_key === triggerKey && t.is_active);
        return found ?? null;
    }
    return null;
};

const getSettings = async () => {
    const now = Date.now();
    if (settingsCache && (now - settingsCacheTime < 60000)) {
        return settingsCache;
    }
    try {
        const res = await client.get('/api/v1/settings');
        settingsCache = res.data?.data ?? {};
        settingsCacheTime = now;
        return settingsCache;
    } catch (err) {
        logger.error('[ISP] getSettings failed:', err.message);
        return settingsCache || {};
    }
};

/**
 * Hitung jumlah pelanggan yang direferensikan oleh customer ini.
 * @param {number} customerId
 * @returns {Promise<number>}
 */
const getReferredCount = async (customerId) => {
    try {
        const res = await client.get('/api/v1/customers');
        const customers = res.data?.data || [];
        return customers.filter(c => c.referred_by_id === customerId).length;
    } catch (err) {
        logger.error(`[ISP] getReferredCount failed for customer ${customerId}:`, err.message);
        return 0;
    }
};

/**
 * Ajukan penarikan tunai saldo referral.
 * @param {number} customerId
 * @param {number} amount
 * @returns {Promise<object>}
 */
const withdrawReferral = async (customerId, amount) => {
    try {
        const res = await client.post(`/api/v1/customers/${customerId}/referral/withdraw`, { amount });
        return res.data;
    } catch (err) {
        logger.error(`[ISP] withdrawReferral failed for customer ${customerId}:`, err.message);
        throw new Error(err.response?.data?.error || err.message);
    }
};

/**
 * Tukarkan saldo referral menjadi voucher diskon tagihan.
 * @param {number} customerId
 * @param {number} amount
 * @returns {Promise<object>}
 */
const convertReferralToVoucher = async (customerId, amount) => {
    try {
        const res = await client.post(`/api/v1/customers/${customerId}/referral/convert-voucher`, { amount });
        return res.data;
    } catch (err) {
        logger.error(`[ISP] convertReferralToVoucher failed for customer ${customerId}:`, err.message);
        throw new Error(err.response?.data?.error || err.message);
    }
};

const getActiveTicket = async (phone) => {
    try {
        const res = await client.get('/api/v1/tickets');
        const tickets = res.data?.data || [];
        const cleanPhone = phone.replace(/@c\.us$/, '').replace(/^0/, '62');
        return tickets.find(t => {
            const tPhone = t.no_hp.replace(/@c\.us$/, '').replace(/^0/, '62');
            return tPhone === cleanPhone && (t.status === 'open' || t.status === 'pending');
        }) || null;
    } catch (err) {
        logger.error(`[ISP] getActiveTicket failed for ${phone}:`, err.message);
        return null;
    }
};

const replyToTicket = async (ticketId, senderType, message) => {
    try {
        const res = await client.post(`/api/v1/tickets/${ticketId}/messages`, {
            message,
            sender_type: senderType
        });
        return res.data?.data ?? null;
    } catch (err) {
        logger.error(`[ISP] replyToTicket failed for ticket ${ticketId}:`, err.message);
        throw new Error(err.response?.data?.error || err.message);
    }
};

const updateCustomerWifi = async (customerId, ssid, password) => {
    try {
        const res = await client.post(`/api/v1/customers/${customerId}/ont-wifi`, { ssid, password });
        return res.data;
    } catch (err) {
        logger.error(`[ISP] updateCustomerWifi failed for customer ${customerId}:`, err.message);
        throw new Error(err.response?.data?.error || err.message);
    }
};

const claimVoucher = async (customerId, code) => {
    try {
        const res = await client.post(`/api/v1/customers/${customerId}/vouchers/claim`, { code });
        return res.data;
    } catch (err) {
        logger.error(`[ISP] claimVoucher failed for customer ${customerId}:`, err.message);
        throw new Error(err.response?.data?.error || err.message);
    }
};

const toggleAutoApplyVoucher = async (customerId, autoApply) => {
    try {
        const res = await client.post(`/api/v1/customers/${customerId}/vouchers/toggle-auto-apply`, { auto_apply: autoApply });
        return res.data;
    } catch (err) {
        logger.error(`[ISP] toggleAutoApplyVoucher failed for customer ${customerId}:`, err.message);
        throw new Error(err.response?.data?.error || err.message);
    }
};

const getCustomerVouchers = async (customerId) => {
    try {
        const res = await client.get('/api/v1/vouchers/customer-vouchers');
        const list = res.data?.data || [];
        return list.filter(cv => cv.pelanggan_id === customerId && cv.status === 'active');
    } catch (err) {
        logger.error(`[ISP] getCustomerVouchers failed:`, err.message);
        return [];
    }
};

module.exports = {
    findCustomerByPhone,
    findCustomersByPhone,
    findCustomerByID,
    getActiveBill,
    getPackageList,
    notifyAdminViaWA,
    notifyAdminViaDiscord,
    createTicket,
    getTemplateByTrigger,
    getAllTemplates,
    getSettings,
    getReferredCount,
    withdrawReferral,
    convertReferralToVoucher,
    getActiveTicket,
    replyToTicket,
    updateCustomerWifi,
    claimVoucher,
    toggleAutoApplyVoucher,
    getCustomerVouchers,
};
