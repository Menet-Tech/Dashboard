const logger = require('../utils/logger');
const { saveMessage, getGatewaySetting, getSession } = require('../utils/database');
const { handleMessage } = require('../services/chatbot.service');
const { sendTextMessage, sendMediaMessage, isAutomatedMessage } = require('../services/whatsapp.service');
const { findReplyRule } = require('../services/autoReply.service');
const {
    getSettings,
    findCustomersByPhone,
    getActiveBill,
    getPendingConfirmation,
    uploadProofBase64,
    createPaymentConfirmation,
    notifyAdminViaDiscord
} = require('../services/isp.service');

const accountMatchesSetting = (settingValue, accountId) => {
    const value = String(settingValue || '*').trim();
    if (!value || value === '*') return true;
    return value.split(',').map((item) => item.trim()).filter(Boolean).includes(accountId);
};

const lastAdminReplies = new Map(); // key: clean phone, value: timestamp ms

const setupEvents = (client, accountId) => {
    const setupTime = Math.floor(Date.now() / 1000);

    // Track admin outbound messages to enforce 15-minute cooldown
    client.on('message_create', (message) => {
        if (message.fromMe) {
            // Cek apakah pesan ini adalah notifikasi otomatis yang dikirim oleh sistem.
            // Gunakan isAutomatedMessage() agar tidak bergantung langsung ke global state.
            if (isAutomatedMessage(message.id.id) || isAutomatedMessage(message.id._serialized)) {
                logger.debug(`[${accountId}] Balasan admin diabaikan karena terdeteksi sebagai notifikasi otomatis system: ${message.id.id}`);
                return;
            }

            const recipient = message.to.replace(/@(c\.us|lid)$/, '').replace(/[+\-\s]/g, '').replace(/^0/, '62');
            lastAdminReplies.set(recipient, Date.now());
            logger.debug(`[${accountId}] Tercatat balasan admin ke ${recipient} pada ${new Date().toISOString()}`);
        }
    });

    client.on('auth_failure', (msg) => {
        logger.error(`[${accountId}] Authentication failed: ${msg}`);
    });

    client.on('message', async (message) => {
        // Abaikan pesan lama yang diterima saat bot baru menyala/reconnect (historical/offline messages)
        if (message.timestamp && message.timestamp < setupTime) {
            return;
        }

        // Abaikan pesan dari grup, broadcast, status, dan pesan kosong (kecuali jika ada media seperti bukti transfer)
        if (!message.from || message.from.includes('@g.us') || message.from.includes('@broadcast') || (!message.body && !message.hasMedia)) {
            return;
        }

        // Resolusi LID JID ke @c.us jika memungkinkan
        let contactName = '';
        let realFrom = message.from;
        try {
            const contact = await message.getContact();
            contactName = contact.pushname || contact.name || '';
            if (contact.id && contact.id.server === 'c.us') {
                realFrom = contact.id._serialized;
            }
        } catch (err) {
            logger.error(`[${accountId}] Gagal getContact untuk ${message.from}: ${err.message}`);
        }

        logger.debug(`[${accountId}] Pesan masuk dari ${realFrom} (LID asli: ${message.from}): ${message.body}`);

        // Kirim alert ke Discord jika pengirim bukan nomor admin
        try {
            const globalSettings = await getSettings().catch(() => ({}));
            const globalChatbotEnabled = globalSettings.wa_chatbot_enabled !== '0';
            const chatbotEnabled = (getGatewaySetting('chatbot_enabled', '1') !== '0') && globalChatbotEnabled;

            // Only notify Discord if chatbot is DISABLED
            if (!chatbotEnabled) {
                const adminNumbers = String(globalSettings.wa_admin_numbers || '')
                    .split(',')
                    .map(n => n.trim().replace(/@(c\.us|lid)$/, '').replace(/[+\-\s]/g, '').replace(/^0/, '62'))
                    .filter(Boolean);
                
                const senderClean = realFrom.replace(/@(c\.us|lid)$/, '').replace(/[+\-\s]/g, '').replace(/^0/, '62');
                const isAdmin = adminNumbers.includes(senderClean);
                
                if (!isAdmin) {
                    // Check if we are within the 15-minute admin reply cooldown (15 * 60 * 1000 ms)
                    const lastReply = lastAdminReplies.get(senderClean) || 0;
                    const isCooldown = (Date.now() - lastReply) < (15 * 60 * 1000);

                    if (isCooldown) {
                        logger.debug(`[${accountId}] Notifikasi Discord dilewati karena admin baru membalas kurang dari 15 menit lalu (${senderClean})`);
                    } else {
                        // Check if message is related to billing/payment
                        const session = getSession(realFrom);
                        const chatbotState = session?.state ?? 'IDLE';
                        const isMedia = message.hasMedia || 
                                        message.type === 'image' || 
                                        message.type === 'video' || 
                                        message.type === 'document' || 
                                        message.type === 'audio' || 
                                        message.type === 'voice' || 
                                        message.type === 'sticker' ||
                                        (message.mimetype && (
                                            message.mimetype.startsWith('image/') || 
                                            message.mimetype.startsWith('video/') || 
                                            message.mimetype.startsWith('audio/') || 
                                            message.mimetype.startsWith('application/')
                                        ));
                        const bodyText = (message.body || '').trim().toLowerCase();

                        const isBillingKeyword = 
                            bodyText === 'oke, saya bayar' || 
                            bodyText === 'oke saya bayar' || 
                            bodyText === 'ok saya bayar' || 
                            bodyText === 'siap' || 
                            bodyText === 'sudah bayar' || 
                            bodyText === 'bukti transfer' || 
                            bodyText.includes('bayar');
                        
                        const isBillingState = chatbotState === 'WAITING_PROOF' || chatbotState === 'WAITING_PAYMENT_METHOD';

                        if (!(isMedia || isBillingKeyword || isBillingState)) {
                            const discordMsg = `💬 **Pesan Masuk Baru dari Pelanggan**
• **Pengirim**: ${contactName || 'Tidak Diketahui'} (${senderClean})
• **Pesan**: ${message.body || '[Media/Gambar]'}
• **Link Chat**: https://wa.me/${senderClean}`;
                            await notifyAdminViaDiscord({ phone: realFrom, contactName }, discordMsg);
                        } else {
                            logger.debug(`[${accountId}] Notifikasi Discord dilewati karena pesan terdeteksi terkait tagihan/pembayaran (${senderClean})`);
                        }
                    }
                }
            }
        } catch (err) {
            logger.error(`[${accountId}] Gagal mengirim notifikasi discord pesan masuk: ${err.message}`);
        }

        // Simpan pesan ke history
        try {
            const internalId = saveMessage(
                message.to || 'me',
                message.body,
                message.hasMedia ? 'media' : 'text',
                message.id.id,
                'inbound',
                realFrom,
                accountId
            );

            // Broadcast ke dashboard via Socket.io
            if (global.io) {
                global.io.emit('chat_message', {
                    id: internalId,
                    account_id: accountId,
                    direction: 'inbound',
                    from_number: realFrom,
                    to_number: message.to || 'me',
                    body: message.body,
                    type: message.hasMedia ? 'media' : 'text',
                    wa_message_id: message.id.id,
                    created_at: new Date().toISOString(),
                });
            }
        } catch (err) {
            logger.error(`[${accountId}] Gagal simpan pesan: ${err.message}`);
        }

        const autoReplyAccount = getGatewaySetting('auto_reply_account_id', '*');
        const chatbotAccount = getGatewaySetting('chatbot_account_id', '*');
        const autoReplyBeforeChatbot = getGatewaySetting('auto_reply_before_chatbot', '1') !== '0';

        if (autoReplyBeforeChatbot && accountMatchesSetting(autoReplyAccount, accountId)) {
            const rule = findReplyRule(message.body, accountId);
            if (rule) {
                try {
                    if (rule.image_path || rule.imagePath) {
                        const path = require('path');
                        const fullPath = path.join(__dirname, '../../storage/uploads', rule.image_path || rule.imagePath);
                        await sendMediaMessage(accountId, realFrom, fullPath, rule.reply);
                    } else {
                        await sendTextMessage(accountId, realFrom, rule.reply);
                    }
                } catch (err) {
                    logger.error(`[${accountId}] Gagal mengirim autoreply ke ${realFrom}: ${err.message}`);
                }
                return;
            }
        }

        const globalSettings = await getSettings().catch(() => ({}));
        const globalChatbotEnabled = globalSettings.wa_chatbot_enabled !== '0';
        const chatbotEnabled = (getGatewaySetting('chatbot_enabled', '1') !== '0') && globalChatbotEnabled;
        if (!chatbotEnabled || !accountMatchesSetting(chatbotAccount, accountId)) {
            // Chatbot is disabled. Check if this is a photo/media to upload as payment proof.
            const hasMedia = message.hasMedia || message.type === 'image';
            if (hasMedia) {
                try {
                    const customersList = await findCustomersByPhone(realFrom);
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
                        const media = await message.downloadMedia();
                        if (media && media.data) {
                            const uploadRes = await uploadProofBase64(media.data, media.mimetype, media.filename || 'payment_proof.png');
                            const proofPath = uploadRes.proof_path;

                            if (unpaidBills.length > 0) {
                                const primary = unpaidBills[0];
                                const linkedIds = unpaidBills.slice(1).map(item => item.bill.id).join(',');
                                await createPaymentConfirmation(primary.bill.id, primary.customer.id, proofPath, message.body || "Diunggah via WA (Chatbot Off)", linkedIds);

                                try {
                                    const { getTemplateByTrigger } = require('../services/isp.service');
                                    const { renderTemplate } = require('../services/chatbot/utils');
                                    const successTpl = await getTemplateByTrigger('auto_reply_payment_proof').catch(() => null);
                                    const successMsg = successTpl 
                                        ? renderTemplate(successTpl.content || successTpl.isi_template, { nama: primary.customer.name })
                                        : "Terima kasih! Bukti transfer Anda telah diterima secara otomatis dan sedang dalam proses verifikasi (pending) oleh admin.";
                                    
                                    await sendTextMessage(accountId, realFrom, successMsg);
                                } catch (replyErr) {
                                    logger.error(`[${accountId}] Gagal mengirim balasan konfirmasi (Chatbot Off): ${replyErr.message}`);
                                }
                            }
                            logger.info(`[${accountId}] Sukses memproses bukti transfer dari ${realFrom} (Chatbot Off)`);
                        }
                    }
                } catch (err) {
                    logger.error(`[${accountId}] Gagal memproses bukti transfer (Chatbot Off) untuk ${realFrom}: ${err.message}`);
                }
            }
            return;
        }

        // Teruskan ke chatbot ISP
        try {
            await handleMessage(
                realFrom,
                message.body || '',
                accountId,
                sendTextMessage,
                contactName,
                message
            );
        } catch (err) {
            logger.error(`[${accountId}] Chatbot error: ${err.message}`);
        }
    });
};

module.exports = { setupEvents };
