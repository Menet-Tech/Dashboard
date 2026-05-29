const { getClient } = require('../whatsapp/client');
const { formatPhoneNumber } = require('../utils/formatter');
const { MessageMedia, Buttons, List } = require('whatsapp-web.js');
const { WhatsAppError } = require('../utils/errors');
const { saveMessage } = require('../utils/database');

const sendTextMessage = async (accountId, to, text, quotedMessageId = null) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(to);
    const options = quotedMessageId ? { quotedMessageId } : {};
    try {
        const result = await client.sendMessage(chatId, text, options);
        // Simpan ke database
        try { 
            const newId = saveMessage(to, text, 'text', result?.id?._serialized, 'outbound', null, accountId); 
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
        if (err.message.includes('invalid number')) {
            throw new WhatsAppError('Nomor tidak valid');
        }
        throw new WhatsAppError('Gagal mengirim pesan: ' + err.message);
    }
};

const sendMediaMessage = async (accountId, to, filePath, caption = '', quotedMessageId = null) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(to);
    try {
        const media = MessageMedia.fromFilePath(filePath);
        const options = { caption, ...(quotedMessageId ? { quotedMessageId } : {}) };
        const result = await client.sendMessage(chatId, media, options);
        // Simpan ke database
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

const sendButtonMessage = async (accountId, to, body, buttons, title, footer) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(to);
    try {
        const buttonObj = new Buttons(body, buttons, title, footer);
        const result = await client.sendMessage(chatId, buttonObj);
        try { saveMessage(to, title || 'Button Message', 'button', result?.id?._serialized); } catch (_) { }
        return result;
    } catch (err) {
        throw new WhatsAppError('Gagal mengirim pesan tombol: ' + err.message);
    }
};

const sendListMessage = async (accountId, to, body, buttonText, sections, title, footer) => {
    const client = getClient(accountId);
    const chatId = formatPhoneNumber(to);
    try {
        const listObj = new List(body, buttonText, sections, title, footer);
        const result = await client.sendMessage(chatId, listObj);
        try { saveMessage(to, title || 'List Message', 'list', result?.id?._serialized); } catch (_) { }
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
    getChatById
};
