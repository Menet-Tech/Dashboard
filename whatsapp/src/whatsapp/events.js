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
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const accountMatchesSetting = (settingValue, accountId) => {
    const value = String(settingValue || '*').trim();
    if (!value || value === '*') return true;
    return value.split(',').map((item) => item.trim()).filter(Boolean).includes(accountId);
};

const lastAdminReplies = new Map(); // key: clean phone, value: timestamp ms

const setupEvents = (sock, accountId) => {
    const setupTime = Math.floor(Date.now() / 1000);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return; // Ignore historical syncs

        for (const msg of messages) {
            if (!msg.message) continue; // Usually system messages (like "group subject changed")
            
            // Cek apakah pesan dari diri sendiri (admin)
            if (msg.key.fromMe) {
                if (isAutomatedMessage(msg.key.id)) {
                    logger.debug(`[${accountId}] Balasan admin diabaikan karena terdeteksi sebagai notifikasi otomatis system: ${msg.key.id}`);
                    continue;
                }

                const recipient = (msg.key.remoteJid || '').replace(/@(s\.whatsapp\.net|lid)$/, '').replace(/[+\-\s]/g, '').replace(/^0/, '62');
                lastAdminReplies.set(recipient, Date.now());
                logger.debug(`[${accountId}] Tercatat balasan admin ke ${recipient} pada ${new Date().toISOString()}`);
                continue;
            }

            // Ignore status broadcasts and groups
            if (msg.key.remoteJid.includes('@g.us') || msg.key.remoteJid === 'status@broadcast') {
                continue;
            }
            
            if (msg.messageTimestamp && msg.messageTimestamp < setupTime) {
                continue;
            }

            let realFrom = msg.key.remoteJid;
            
            // Resolve LID to real phone number using Baileys lidMapping if available
            if (realFrom && realFrom.includes('@lid')) {
                try {
                    let resolvedPn = null;
                    if (sock.signalRepository?.lidMapping?.getPNForLID) {
                        const result = sock.signalRepository.lidMapping.getPNForLID(realFrom);
                        resolvedPn = result instanceof Promise ? await result : result;
                    }
                    
                    if (resolvedPn) {
                        // Hilangkan suffix device id seperti :0
                        resolvedPn = resolvedPn.replace(/:\d+/, '');
                        logger.debug(`[${accountId}] Berhasil resolve LID ${realFrom} ke nomor asli ${resolvedPn}`);
                        realFrom = resolvedPn; // overwrite with resolved phone number
                    }
                } catch (e) {
                    logger.debug(`[${accountId}] Gagal resolve LID: ${e.message}`);
                }
            }

            const senderClean = realFrom.replace(/@(s\.whatsapp\.net|lid)$/, '').replace(/[+\-\s]/g, '').replace(/^0/, '62');
            const contactName = msg.pushName || '';

            // Extract body text
            let messageBody = '';
            let messageType = 'text';
            let hasMedia = false;

            const unwrapMessage = (m) => {
                if (!m) return m;
                if (m.ephemeralMessage) return unwrapMessage(m.ephemeralMessage.message);
                if (m.viewOnceMessage) return unwrapMessage(m.viewOnceMessage.message);
                if (m.viewOnceMessageV2) return unwrapMessage(m.viewOnceMessageV2.message);
                if (m.viewOnceMessageV2Extension) return unwrapMessage(m.viewOnceMessageV2Extension.message);
                if (m.documentWithCaptionMessage) return unwrapMessage(m.documentWithCaptionMessage.message);
                return m;
            };
            const actualMsg = unwrapMessage(msg.message) || msg.message;

            if (actualMsg.conversation) {
                messageBody = actualMsg.conversation;
            } else if (actualMsg.extendedTextMessage) {
                messageBody = actualMsg.extendedTextMessage.text;
            } else if (actualMsg.imageMessage) {
                messageBody = actualMsg.imageMessage.caption || '';
                messageType = 'media';
                hasMedia = true;
            } else if (actualMsg.videoMessage) {
                messageBody = actualMsg.videoMessage.caption || '';
                messageType = 'media';
                hasMedia = true;
            } else if (actualMsg.documentMessage) {
                messageBody = actualMsg.documentMessage.caption || actualMsg.documentMessage.fileName || '';
                messageType = 'document';
                hasMedia = true;
            } else if (actualMsg.audioMessage) {
                messageType = 'audio';
                hasMedia = true;
            }

            // Pesan kosong tanpa media diabaikan
            if (!messageBody && !hasMedia) continue;

            logger.debug(`[${accountId}] Pesan masuk dari ${realFrom}: ${messageBody}`);

            const globalSettings = await getSettings().catch(() => ({}));
            const adminNumbers = String(globalSettings.wa_admin_numbers || '')
                .split(',')
                .map(n => n.trim().replace(/@(s\.whatsapp\.net|lid)$/, '').replace(/[+\-\s]/g, '').replace(/^0/, '62'))
                .filter(Boolean);
            
            const isAdmin = adminNumbers.includes(senderClean);

            // Intercept Admin ACC / TOLAK Commands
            if (isAdmin && messageBody) {
                const textLower = messageBody.trim().toLowerCase();
                if (textLower.startsWith('acc ') || textLower.startsWith('tolak ')) {
                    const parts = textLower.split(' ');
                    const command = parts[0];
                    const confId = parts[1];

                    if (confId && !isNaN(confId)) {
                        const { approvePaymentConfirmation, rejectPaymentConfirmation, getPendingConfirmation, getSettings } = require('../services/isp.service');
                        
                        try {
                            if (command === 'acc') {
                                await approvePaymentConfirmation(confId);
                                await sendTextMessage(accountId, realFrom, `✅ Konfirmasi #${confId} berhasil di-APPROVE. Tagihan telah lunas.`);
                            } else if (command === 'tolak') {
                                await rejectPaymentConfirmation(confId);
                                await sendTextMessage(accountId, realFrom, `❌ Konfirmasi #${confId} berhasil di-TOLAK.`);
                            }

                            // Close the associated ticket
                            try {
                                const { client } = require('../services/isp.service'); // We need client or just an endpoint
                                // Let's use an inline fetch or add a new function in isp.service
                                // Wait, we can just use `client` directly if we require it. 
                                // Actually, let's just make a new func in isp.service or inline it.
                                // It's better to just call a function.
                                const { closeTicketByConfId } = require('../services/isp.service');
                                await closeTicketByConfId(confId);
                            } catch (e) {
                                logger.error(`Failed to close ticket for ConfID ${confId}:`, e.message);
                            }

                            return; // Stop processing further
                        } catch (cmdErr) {
                            await sendTextMessage(accountId, realFrom, `⚠️ Gagal memproses perintah: ${cmdErr.message}`);
                            return;
                        }
                    }
                }
            }

            // Kirim alert ke Discord jika pengirim bukan nomor admin
            try {
                const globalChatbotEnabled = globalSettings.wa_chatbot_enabled !== '0';
                const chatbotEnabled = (getGatewaySetting('chatbot_enabled', '1') !== '0') && globalChatbotEnabled;

                if (!chatbotEnabled) {
                    if (!isAdmin) {
                        const lastReply = lastAdminReplies.get(senderClean) || 0;
                        const isCooldown = (Date.now() - lastReply) < (15 * 60 * 1000);

                        if (isCooldown) {
                            logger.debug(`[${accountId}] Notifikasi Discord dilewati karena admin baru membalas kurang dari 15 menit lalu (${senderClean})`);
                        } else {
                            const session = getSession(realFrom);
                            const chatbotState = session?.state ?? 'IDLE';
                            
                            const bodyTextStr = messageBody.trim().toLowerCase();
                            const isBillingKeyword = 
                                bodyTextStr === 'oke, saya bayar' || 
                                bodyTextStr === 'oke saya bayar' || 
                                bodyTextStr === 'ok saya bayar' || 
                                bodyTextStr === 'siap' || 
                                bodyTextStr === 'sudah bayar' || 
                                bodyTextStr === 'bukti transfer' || 
                                bodyTextStr.includes('bayar');
                            
                            const isBillingState = chatbotState === 'WAITING_PROOF' || chatbotState === 'WAITING_PAYMENT_METHOD';

                            if (!(hasMedia || isBillingKeyword || isBillingState)) {
                                const isLid = realFrom.includes('@lid');
                                const chatLink = isLid ? 'Tidak tersedia via WA Web (Balas dari Dashboard)' : `https://wa.me/${senderClean}`;
                                
                                const discordMsg = `💬 **Pesan Masuk Baru dari Pelanggan**\n• **Pengirim**: ${contactName || 'Tidak Diketahui'} (${senderClean})\n• **Pesan**: ${messageBody || '[Media/Gambar]'}\n• **Link Chat**: ${chatLink}`;
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
                    'me',
                    messageBody,
                    messageType,
                    msg.key.id,
                    'inbound',
                    realFrom,
                    accountId
                );

                if (global.io) {
                    global.io.emit('chat_message', {
                        id: internalId,
                        account_id: accountId,
                        direction: 'inbound',
                        from_number: realFrom,
                        to_number: 'me',
                        body: messageBody,
                        type: messageType,
                        wa_message_id: msg.key.id,
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
                const rule = findReplyRule(messageBody, accountId);
                if (rule) {
                    try {
                        if (rule.image_path || rule.imagePath) {
                            const fullPath = require('path').join(__dirname, '../../storage/uploads', rule.image_path || rule.imagePath);
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

            const globalChatbotEnabled = globalSettings.wa_chatbot_enabled !== '0';
            const chatbotEnabled = (getGatewaySetting('chatbot_enabled', '1') !== '0') && globalChatbotEnabled;
            
            if (!chatbotEnabled || !accountMatchesSetting(chatbotAccount, accountId)) {
                // Chatbot is disabled. Check if this is a photo/media to upload as payment proof.
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
                            try {
                                const buffer = await downloadMediaMessage(msg, 'buffer', { logger: require('pino')({level:'silent'}) });
                                let mimetype = msg.message.imageMessage?.mimetype || msg.message.documentMessage?.mimetype || 'image/jpeg';
                                let filename = msg.message.documentMessage?.fileName || 'payment_proof.png';
                                
                                const uploadRes = await uploadProofBase64(buffer.toString('base64'), mimetype, filename);
                                const proofPath = uploadRes.proof_path;

                                const primary = unpaidBills[0];
                                const linkedIds = unpaidBills.slice(1).map(item => item.bill.id).join(',');
                                const confRes = await createPaymentConfirmation(primary.bill.id, primary.customer.id, proofPath, messageBody || "Diunggah via WA (Chatbot Off)", linkedIds);
                                const confId = confRes?.id;

                                // Create Ticket
                                let ticketId = '-';
                                if (confId) {
                                    const { createTicket } = require('../services/isp.service');
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
                                    const settings = await getSettings().catch(() => ({}));
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
                                                    `Catatan: ${messageBody || '-'}\n\n` +
                                                    `📝 *Admin, balas pesan ini dengan format:*\n` +
                                                    `*ACC ${confId}* untuk menyetujui, atau\n` +
                                                    `*TOLAK ${confId}* untuk menolak.`;

                                    const path = require('path');
                                    const fullPath = path.join(__dirname, '../../../storage/uploads', proofPath);
                                    
                                    for (const admin of adminNumbers) {
                                        const adminJid = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
                                        await sock.sendMessage(adminJid, { image: { url: fullPath }, caption });
                                    }
                                } catch (forwardErr) {
                                    logger.error(`[${accountId}] Failed to forward payment proof to admin: ${forwardErr.message}`);
                                }

                                try {
                                    const { getTemplateByTrigger } = require('../services/isp.service');
                                    const { renderTemplate } = require('../services/chatbot/utils');
                                    const successTpl = await getTemplateByTrigger('auto_reply_payment_proof').catch(() => null);
                                    const successMsg = successTpl 
                                        ? renderTemplate(successTpl.content || successTpl.isi_template, { nama: primary.customer.name })
                                        : "Terima kasih! Bukti transfer Anda telah kami terima dan sedang dalam proses verifikasi (pending) oleh admin. Terimakasih";
                                    
                                    await sendTextMessage(accountId, realFrom, successMsg);
                                } catch (replyErr) {
                                    logger.error(`[${accountId}] Gagal mengirim balasan konfirmasi (Chatbot Off): ${replyErr.message}`);
                                }
                                logger.info(`[${accountId}] Sukses memproses bukti transfer dari ${realFrom} (Chatbot Off)`);
                            } catch (downloadErr) {
                                logger.error(`[${accountId}] Gagal mendownload media: ${downloadErr.message}`);
                            }
                        }
                    } catch (err) {
                        logger.error(`[${accountId}] Gagal memproses bukti transfer (Chatbot Off) untuk ${realFrom}: ${err.message}`);
                    }
                }
                return;
            }

            // Teruskan ke chatbot ISP
            // For Chatbot handling, we pass the Baileys msg object instead of the puppeteer one.
            // The chatbot.service will need to use downloadMediaMessage on `messageObject` if it wants to download media.
            try {
                // Compatibility shim for existing chatbot service which expects `message.downloadMedia`
                const compatMsg = {
                    ...msg,
                    hasMedia,
                    body: messageBody,
                    from: realFrom,
                    downloadMedia: async () => {
                        const buffer = await downloadMediaMessage(msg, 'buffer', { logger: require('pino')({level:'silent'}) });
                        return {
                            data: buffer.toString('base64'),
                            mimetype: msg.message.imageMessage?.mimetype || msg.message.documentMessage?.mimetype || 'image/jpeg',
                            filename: msg.message.documentMessage?.fileName || 'payment_proof.png'
                        };
                    }
                };

                await handleMessage(
                    realFrom,
                    messageBody || '',
                    accountId,
                    sendTextMessage,
                    contactName,
                    compatMsg
                );
            } catch (err) {
                logger.error(`[${accountId}] Chatbot error: ${err.message}`);
            }
        }
    });
};

module.exports = { setupEvents };
