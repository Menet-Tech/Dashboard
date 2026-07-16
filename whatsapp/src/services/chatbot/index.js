const logger = require('../../utils/logger');
const { getSession, upsertSession, deleteSession } = require('../../utils/database');
const { getTriggers } = require('./templates');
const { normalizePhone } = require('./utils');

// Import handlers
const { handleMenuState, handleSelectBillCustomer } = require('./handlers/menuHandler');
const { handleReferralState } = require('./handlers/referralHandler');
const { handleRegistrationForm, handleSupportForm, handleWifiForm } = require('./handlers/formHandler');
const { handlePaymentStates } = require('./handlers/billingHandler');
const { handleWaitingAdmin } = require('./handlers/adminHandler');

const handleMessage = async (rawFrom, body, accountId, sendFn, contactName = '', rawMsg = null) => {
    const phone = normalizePhone(rawFrom);
    const text = (body || '').trim();
    const lower = text.toLowerCase();

    // User ketik "menu" atau "0" kapan saja → kembali ke awal
    if (lower === 'menu' || lower === '0') {
        deleteSession(rawFrom);
        return handleMessage(rawFrom, '', accountId, sendFn, contactName);
    }

    const session = getSession(rawFrom);
    const state = session?.state ?? 'IDLE';
    const formData = session?.form_data ?? {};

    logger.debug(`[Chatbot] ${phone} state=${state} msg="${text}"`);

    // Dapatkan triggers dari DB
    const triggers = await getTriggers();
    const ctx = {
        rawFrom, phone, text, lower, accountId, sendFn, contactName, rawMsg,
        session, state, formData, triggers
    };

    try {
        if (state === 'IDLE' || state === 'UNREG_MENU' || state === 'REG_MENU') {
            await handleMenuState(ctx);
        } else if (state === 'REG_SELECT_BILL_CUSTOMER') {
            await handleSelectBillCustomer(ctx);
        } else if (state === 'REG_REFERRAL_MENU' || state.startsWith('WAIT_WITHDRAW_')) {
            await handleReferralState(ctx);
        } else if (state.startsWith('REG_WIFI_FORM_')) {
            await handleWifiForm(ctx);
        } else if (state.startsWith('REG_FORM_')) {
            await handleRegistrationForm(ctx);
        } else if (state.startsWith('SUPPORT_FORM_')) {
            await handleSupportForm(ctx);
        } else if (state === 'WAITING_PAYMENT_METHOD' || state === 'WAITING_PROOF') {
            await handlePaymentStates(ctx);
        } else if (state === 'WAITING_ADMIN') {
            await handleWaitingAdmin(ctx);
        } else {
            // Fallback
            deleteSession(rawFrom);
            await handleMessage(rawFrom, '', accountId, sendFn, contactName);
        }
    } catch (err) {
        logger.error(`[Chatbot] Error handling state ${state}:`, err.message);
        await sendFn(accountId, rawFrom, "Terjadi kesalahan pada sistem kami. Silakan ketik *menu* untuk kembali.");
    }
};

module.exports = { handleMessage };
