const logger = require('../../utils/logger');
const { getSession, upsertSession, deleteSession, getLastOutboundMessage } = require('../../utils/database');
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

    // Auto-detection of payment proof:
    // If the incoming message is media (e.g., photo/image), and the state is NOT WAITING_PROOF (which handles it already),
    // and the last outbound message sent to this user was related to billing (e.g. contains invoice, tagihan, jatuh tempo, etc.),
    // and they have unpaid bills, then treat this media as their payment proof!
    const hasMedia = rawMsg && (rawMsg.hasMedia || rawMsg.type === 'image');
    if (hasMedia && state !== 'WAITING_PROOF') {
        const lastMsg = getLastOutboundMessage(rawFrom);
        const isBillingRelated = (bodyText) => {
            if (!bodyText) return false;
            const b = bodyText.toLowerCase();
            return b.includes('tagihan') || 
                   b.includes('invoice') || 
                   b.includes('jatuh tempo') || 
                   b.includes('pembayaran') || 
                   b.includes('bukti transfer') ||
                   b.includes('trial') ||
                   b.includes('lunas') ||
                   b.includes('mandiri') ||
                   b.includes('seabank');
        };

        if (lastMsg && isBillingRelated(lastMsg.body)) {
            const { findCustomersByPhone, getActiveBill, getPendingConfirmation, getTemplateByTrigger } = require('../isp.service');
            try {
                const customersList = await findCustomersByPhone(rawFrom);
                const unpaidBills = [];
                for (const cust of customersList) {
                    if (cust.is_trial) continue;
                    const bill = await getActiveBill(cust.id);
                    if (bill && bill.status === 'belum_bayar') {
                        const pendingConf = await getPendingConfirmation(bill.id);
                        if (!pendingConf) {
                            unpaidBills.push({ customer: cust, bill });
                        }
                    }
                }

                if (unpaidBills.length > 0) {
                    const media = await rawMsg.downloadMedia();
                    if (media && media.data) {
                        const { uploadProofBase64, createPaymentConfirmation, createTicket, getSettings } = require('../isp.service');
                        const uploadRes = await uploadProofBase64(media.data, media.mimetype, media.filename || 'payment_proof.png');
                        const proofPath = uploadRes.proof_path;

                        const primary = unpaidBills[0];
                        const linkedIds = unpaidBills.slice(1).map(item => item.bill.id).join(',');
                        
                        // Create Payment Confirmation (Pending)
                        const confRes = await createPaymentConfirmation(primary.bill.id, primary.customer.id, proofPath, text || "Terdeteksi & Diunggah via Chatbot WA otomatis", linkedIds);
                        const confId = confRes?.id;

                        // Create Ticket
                        let ticketId = '-';
                        if (confId) {
                            const ticketData = {
                                pelanggan_id: primary.customer.id,
                                kendala: `Konfirmasi Pembayaran - Tagihan ${primary.bill.periode} - ConfID ${confId}`,
                                status: 'open'
                            };
                            const newTicket = await createTicket(ticketData);
                            if (newTicket) ticketId = newTicket.id;
                        }

                        // Forward to Admin WA
                        try {
                            const settings = await getSettings();
                            const adminNumbers = (settings.wa_admin_numbers || '').split(',').map(n => n.trim()).filter(n => n);
                            const customerPhone = primary.customer.phone.replace(/@c\.us$/, '').replace(/^0/, '62');
                            const caption = `🎫 *TICKET BARU: Konfirmasi Pembayaran*\n\n` +
                                            `ID Tiket: #${ticketId}\n` +
                                            `Pelanggan: ${primary.customer.name}\n` +
                                            `No WA: wa.me/+${customerPhone}\n` +
                                            `Username PPPoE: ${primary.customer.user_pppoe || '-'}\n` +
                                            `Tagihan: ${primary.bill.periode}\n` +
                                            `Total: Rp ${primary.bill.harga}\n` +
                                            `Deskripsi: ${primary.customer.deskripsi || '-'}\n` +
                                            `Catatan: ${text || '-'}\n\n` +
                                            `📝 *Admin, balas pesan ini dengan format:*\n` +
                                            `*ACC ${confId}* untuk menyetujui, atau\n` +
                                            `*TOLAK ${confId}* untuk menolak.`;

                            const path = require('path');
                            const fullPath = path.join(__dirname, '../../../../storage/uploads', proofPath);
                            
                            const { sendMediaMessage } = require('../../../utils/baileys'); // or sendFn doesn't support media path?
                            // Wait, sendFn only sends text?
                            // Let's use the gateway's sendMediaMessage
                            const { getSock } = require('../../../utils/baileys');
                            const sock = getSock(accountId);
                            if (sock) {
                                for (const admin of adminNumbers) {
                                    const adminJid = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
                                    await sock.sendMessage(adminJid, { image: { url: fullPath }, caption });
                                }
                            }
                        } catch (forwardErr) {
                            logger.error(`[Chatbot] Failed to forward payment proof to admin: ${forwardErr.message}`);
                        }

                        // Load and render custom success message if configured
                        const successTpl = await getTemplateByTrigger('auto_reply_payment_proof').catch(() => null);
                        const successMsg = successTpl 
                            ? renderTemplate(successTpl.content || successTpl.isi_template, { nama: primary.customer.name })
                            : "Terima kasih! Bukti transfer Anda telah kami terima dan sedang dalam proses verifikasi (pending) oleh admin. Terimakasih";

                        // Reset session state
                        upsertSession(rawFrom, accountId, 'REG_MENU', { ...formData, hasBills: true, customerName: primary.customer.name });
                        await sendFn(accountId, rawFrom, `✅ *${successMsg}*\n\nKetik *menu* untuk kembali.`);
                        return;
                    }
                }
            } catch (err) {
                logger.error(`[Chatbot] Auto payment proof upload failed for ${rawFrom}: ${err.message}`);
            }
        }
    }

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
