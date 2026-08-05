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
const { MessageMedia, Buttons, List } = require('whatsapp-web.js');
const { WhatsAppError } = require('../utils/errors');
const { saveMessage } = require('../utils/database');

const recordOutboundMessage = (accountId, to, body, type, result) => {
    const newId = saveMessage(to, body, type, result?.id?._serialized, 'outbound', null, accountId);
    if (global.io) {
        global.io.emit('chat_message', {
            id: newId,
            account_id: accountId,
            direction: 'outbound',
            from_number: null,
            to_number: to,
            body,
            type,
            wa_message_id: result?.id?._serialized,
            created_at: new Date().toISOString()
        });
    }
};

const sendTextMessage = async (accountId, to, text, quotedMessageId = null, is_manual = false, idempotencyKey = null) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(to);
    const options = quotedMessageId ? { quotedMessageId } : {};
    
    // OpSec: Simulate typing delay for automated messages
    if (!is_manual) {
        try {
            await client.sendPresenceAvailable();
            const chat = await client.getChatById(chatId);
            if (chat) {
                await chat.sendStateTyping();
            }
            const delayMs = Math.floor(Math.random() * 2000) + 1500;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        } catch (e) {
            // Abaikan error jika chat belum ada atau fitur tidak didukung
        }
    }

    try {
        const result = await client.sendMessage(chatId, text, options);
        logger.debug(`[sendTextMessage] result type=${typeof result}, hasId=${!!(result && result.id)}, result=${JSON.stringify(result?.id)}`);
        if (!is_manual && result && result.id) {
            registerAutomatedMessage(result);
        }
        // Simpan ke database
        try {
            const newId = saveMessage(to, text, 'text', result?.id?._serialized, 'outbound', null, accountId, idempotencyKey);
            if (global.io) {
                global.io.emit('chat_message', {
                    id: newId, account_id: accountId, direction: 'outbound',
                    from_number: null, to_number: to, body: text, type: 'text',
                    wa_message_id: result?.id?._serialized, created_at: new Date().toISOString()
                });
            }
        } catch (_) { }
        return result;
    } catch (err) {
        logger.error(`[sendTextMessage] client.sendMessage threw: ${err?.message || err}`, { chatId, errType: err?.constructor?.name });
        if (err.message && err.message.includes('invalid number')) {
            throw new WhatsAppError('Nomor tidak valid');
        }
        throw new WhatsAppError('Gagal mengirim pesan: ' + err.message);
    }
};


const sendMediaMessage = async (accountId, to, filePath, caption = '', quotedMessageId = null, is_manual = false) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(to);
    try {
        const media = MessageMedia.fromFilePath(filePath);
        const options = { caption, ...(quotedMessageId ? { quotedMessageId } : {}) };
        const result = await client.sendMessage(chatId, media, options);
        if (!is_manual && result && result.id) {
            registerAutomatedMessage(result);
        }
        try { 
            const newId = saveMessage(to, caption || '[media]', 'media', result?.id?._serialized, 'outbound', null, accountId); 
            if (global.io) {
                global.io.emit('chat_message', {
                    id: newId, account_id: accountId, direction: 'outbound', 
                    from_number: null, to_number: to, body: caption || '[media]', type: 'media',
                    wa_message_id: result?.id?._serialized, created_at: new Date().toISOString()
                });
            }
        } catch (_) { }
        return result;
    } catch (err) {
        throw new WhatsAppError('Gagal mengirim media: ' + err.message);
    }
};

const sendButtonMessage = async (accountId, to, body, buttons, title, footer, is_manual = false) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(to);
    try {
        const buttonObj = new Buttons(body, buttons, title, footer);
        const result = await client.sendMessage(chatId, buttonObj);
        if (!is_manual && result && result.id) {
            registerAutomatedMessage(result);
        }
        try { recordOutboundMessage(accountId, to, title || body || 'Button Message', 'button', result); } catch (_) { }
        return result;
    } catch (err) {
        throw new WhatsAppError('Gagal mengirim pesan tombol: ' + err.message);
    }
};

const sendListMessage = async (accountId, to, body, buttonText, sections, title, footer, is_manual = false) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(to);
    try {
        const listObj = new List(body, buttonText, sections, title, footer);
        const result = await client.sendMessage(chatId, listObj);
        if (!is_manual && result && result.id) {
            registerAutomatedMessage(result);
        }
        try { recordOutboundMessage(accountId, to, title || body || 'List Message', 'list', result); } catch (_) { }
        return result;
    } catch (err) {
        throw new WhatsAppError('Gagal mengirim pesan list: ' + err.message);
    }
};


const getContacts = async (accountId) => {
    const client = getClient(accountId);
    return await client.getContacts();
};
const getContactById = async (accountId, contactId) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(contactId);
    return await client.getContactById(chatId);
};
const getProfilePicUrl = async (accountId, contactId) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(contactId);
    return await client.getProfilePicUrl(chatId);
};

const isRegisteredUser = async (accountId, contactId) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(contactId);
    return await client.isRegisteredUser(chatId);
};

// Group Functions
const createGroup = async (accountId, title, participants) => {
    const client = getClient(accountId);
    // format all numbers
    const formattedParticipants = participants.map(p => formatPhoneNumber(p));
    return await client.createGroup(title, formattedParticipants);
};
const getChats = async (accountId) => {
    const client = getClient(accountId);
    return await client.getChats();
};
const getChatById = async (accountId, groupId) => {
    const client = getClient(accountId);
    return await client.getChatById(groupId);
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
