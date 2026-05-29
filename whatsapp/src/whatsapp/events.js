const logger = require('../utils/logger');
const { saveMessage } = require('../utils/database');
const { handleMessage } = require('../services/chatbot.service');
const { sendTextMessage } = require('../services/whatsapp.service');

const setupEvents = (client, accountId) => {
    client.on('auth_failure', (msg) => {
        logger.error(`[${accountId}] Authentication failed:`, msg);
    });

    client.on('message', async (message) => {
        // Abaikan pesan dari grup, broadcast, status, dan pesan kosong
        if (!message.from || message.from.includes('@g.us') || message.from.includes('@broadcast') || !message.body) {
            return;
        }

        logger.debug(`[${accountId}] Pesan masuk dari ${message.from}: ${message.body}`);

        // Simpan pesan ke history
        try {
            const internalId = saveMessage(
                message.to || 'me',
                message.body,
                message.hasMedia ? 'media' : 'text',
                message.id.id,
                'inbound',
                message.from,
                accountId
            );

            // Broadcast ke dashboard via Socket.io
            if (global.io) {
                global.io.emit('chat_message', {
                    id: internalId,
                    account_id: accountId,
                    direction: 'inbound',
                    from_number: message.from,
                    to_number: message.to || 'me',
                    body: message.body,
                    type: message.hasMedia ? 'media' : 'text',
                    wa_message_id: message.id.id,
                    created_at: new Date().toISOString(),
                });
            }
        } catch (err) {
            logger.error(`[${accountId}] Gagal simpan pesan:`, err.message);
        }

        // Ambil nama kontak (opsional, tidak fatal jika gagal)
        let contactName = '';
        try {
            const contact = await message.getContact();
            contactName = contact.pushname || contact.name || '';
        } catch (_) {}

        // Teruskan ke chatbot ISP
        try {
            await handleMessage(
                message.from,
                message.body,
                accountId,
                sendTextMessage,
                contactName
            );
        } catch (err) {
            logger.error(`[${accountId}] Chatbot error:`, err.message);
        }
    });
};

module.exports = { setupEvents };
