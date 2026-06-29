const logger = require('../utils/logger');
const { saveMessage, getGatewaySetting } = require('../utils/database');
const { handleMessage } = require('../services/chatbot.service');
const { sendTextMessage } = require('../services/whatsapp.service');
const { findReply } = require('../services/autoReply.service');

const accountMatchesSetting = (settingValue, accountId) => {
    const value = String(settingValue || '*').trim();
    if (!value || value === '*') return true;
    return value.split(',').map((item) => item.trim()).filter(Boolean).includes(accountId);
};

const setupEvents = (client, accountId) => {
    const setupTime = Math.floor(Date.now() / 1000);

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
            const reply = findReply(message.body, accountId);
            if (reply) {
                try {
                    await sendTextMessage(accountId, realFrom, reply);
                } catch (err) {
                    logger.error(`[${accountId}] Gagal mengirim autoreply ke ${realFrom}: ${err.message}`);
                }
                return;
            }
        }

        if (!accountMatchesSetting(chatbotAccount, accountId)) {
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
