// Ganti Set tak terbatas dengan Map berbasis TTL (15 menit) untuk mencegah memory leak.
// Setiap entri menyimpan timestamp sehingga dapat dibersihkan secara periodik.
global._automatedMessageIds = global._automatedMessageIds || new Map();
const AUTOMATED_MSG_TTL_MS = 15 * 60 * 1000; // 15 menit

// Bersihkan entri yang sudah kadaluarsa setiap 5 menit
if (!global._automatedMsgCleanupRegistered) {
    global._automatedMsgCleanupRegistered = true;
    setInterval(() => {
        const now = Date.now();
        for (const [key, ts] of global._automatedMessageIds.entries()) {
            if (now - ts > AUTOMATED_MSG_TTL_MS) {
                global._automatedMessageIds.delete(key);
            }
        }
    }, 5 * 60 * 1000);
}

/** Catat ID pesan outbound otomatis agar tidak dihitung sebagai balasan admin manual. */
const registerAutomatedMessage = (result) => {
    if (result && result.id) {
        const now = Date.now();
        if (result.id.id)          global._automatedMessageIds.set(result.id.id, now);
        if (result.id._serialized) global._automatedMessageIds.set(result.id._serialized, now);
    }
};

/**
 * Cek apakah ID pesan termasuk pesan otomatis.
 * Digunakan oleh events.js untuk mengecek `message_create`.
 */
const isAutomatedMessage = (msgId) => global._automatedMessageIds.has(msgId);

const logger = require('../utils/logger');
const getClient = (accountId) => {
    return require('../whatsapp/client').getClient(accountId);
};
const { formatPhoneNumber } = require('../utils/formatter');
const { WhatsAppError } = require('../utils/errors');
const { saveMessage } = require('../utils/database');
const fs = require('fs');

const recordOutboundMessage = (accountId, to, body, type, result) => {
    const msgId = result?.key?.id;
    const newId = saveMessage(to, body, type, msgId, 'outbound', null, accountId);
    if (global.io) {
        global.io.emit('chat_message', {
            id: newId,
            account_id: accountId,
            direction: 'outbound',
            from_number: null,
            to_number: to,
            body,
            type,
            wa_message_id: msgId,
            created_at: new Date().toISOString()
        });
    }
};

const sendTextMessage = async (accountId, to, text, quotedMessageId = null, is_manual = false, idempotencyKey = null) => {
    const sock = getClient(accountId);
    if (!sock) throw new WhatsAppError('WhatsApp client not found');
    const chatId = formatPhoneNumber(to);
    
    // OpSec: Simulate typing delay for automated messages
    if (!is_manual) {
        try {
            await sock.sendPresenceUpdate('composing', chatId);
            const delayMs = Math.floor(Math.random() * 2000) + 1500;
            await new Promise(resolve => setTimeout(resolve, delayMs));
            await sock.sendPresenceUpdate('paused', chatId);
        } catch (e) {
            // Ignore
        }
    }

    try {
        const result = await sock.sendMessage(chatId, { text });
        if (!is_manual && result?.key?.id) {
            registerAutomatedMessage({ id: { _serialized: result.key.id } }); // Polyfill for existing code
        }
        
        try {
            const newId = saveMessage(to, text, 'text', result?.key?.id, 'outbound', null, accountId, idempotencyKey);
            if (global.io) {
                global.io.emit('chat_message', {
                    id: newId, account_id: accountId, direction: 'outbound',
                    from_number: null, to_number: to, body: text, type: 'text',
                    wa_message_id: result?.key?.id, created_at: new Date().toISOString()
                });
            }
        } catch (_) { }
        return result;
    } catch (err) {
        logger.error(`[sendTextMessage] sock.sendMessage threw: ${err?.message || err}`);
        throw new WhatsAppError('Gagal mengirim pesan: ' + err.message);
    }
};


const sendMediaMessage = async (accountId, to, filePath, caption = '', quotedMessageId = null, is_manual = false) => {
    const sock = getClient(accountId);
    if (!sock) throw new WhatsAppError('WhatsApp client not found');
    const chatId = formatPhoneNumber(to);
    try {
        const buffer = fs.readFileSync(filePath);
        // Determine mimetype roughly
        const ext = filePath.split('.').pop().toLowerCase();
        let mimetype = 'image/jpeg';
        let msgType = 'image';
        
        if (['mp4', 'avi', 'mov'].includes(ext)) { mimetype = 'video/mp4'; msgType = 'video'; }
        else if (['pdf', 'doc', 'docx', 'xls'].includes(ext)) { mimetype = 'application/pdf'; msgType = 'document'; }
        
        const messageContent = {};
        if (msgType === 'image') messageContent.image = buffer;
        else if (msgType === 'video') messageContent.video = buffer;
        else messageContent.document = buffer;
        
        if (caption) messageContent.caption = caption;
        messageContent.mimetype = mimetype;

        const result = await sock.sendMessage(chatId, messageContent);
        if (!is_manual && result?.key?.id) {
            registerAutomatedMessage({ id: { _serialized: result.key.id } });
        }
        try { 
            const newId = saveMessage(to, caption || '[media]', 'media', result?.key?.id, 'outbound', null, accountId); 
            if (global.io) {
                global.io.emit('chat_message', {
                    id: newId, account_id: accountId, direction: 'outbound', 
                    from_number: null, to_number: to, body: caption || '[media]', type: 'media',
                    wa_message_id: result?.key?.id, created_at: new Date().toISOString()
                });
            }
        } catch (_) { }
        return result;
    } catch (err) {
        throw new WhatsAppError('Gagal mengirim media: ' + err.message);
    }
};

const sendButtonMessage = async (accountId, to, body, buttons, title, footer, is_manual = false) => {
    throw new WhatsAppError('Buttons are deprecated in standard Baileys API/WhatsApp API for regular accounts.');
};

const sendListMessage = async (accountId, to, body, buttonText, sections, title, footer, is_manual = false) => {
    throw new WhatsAppError('Lists are deprecated in standard Baileys API/WhatsApp API for regular accounts.');
};


const getContacts = async (accountId) => {
    return []; // NotImplemented in pure Baileys easily without store
};
const getContactById = async (accountId, contactId) => {
    const sock = getClient(accountId);
    const [result] = await sock.onWhatsApp(contactId);
    return result;
};
const getProfilePicUrl = async (accountId, contactId) => {
    const sock = getClient(accountId);
    const chatId = formatPhoneNumber(contactId);
    try {
        return await sock.profilePictureUrl(chatId);
    } catch(e) { return null; }
};

const isRegisteredUser = async (accountId, contactId) => {
    const sock = getClient(accountId);
    const chatId = formatPhoneNumber(contactId);
    const [result] = await sock.onWhatsApp(chatId);
    return !!result;
};

// Group Functions
const createGroup = async (accountId, title, participants) => {
    const sock = getClient(accountId);
    const formattedParticipants = participants.map(p => formatPhoneNumber(p));
    return await sock.groupCreate(title, formattedParticipants);
};
const getChats = async (accountId) => {
    return []; // Requires Baileys memory store
};
const getChatById = async (accountId, groupId) => {
    const sock = getClient(accountId);
    return await sock.groupMetadata(groupId);
};

module.exports = {
    sendTextMessage,
    sendMediaMessage,
    sendButtonMessage,
    sendListMessage,
    getContacts,
    getContactById,
    getProfilePicUrl,
    isRegisteredUser,
    createGroup,
    getChats,
    getChatById,
    isAutomatedMessage,
    registerAutomatedMessage,
};
