const { sendTextMessage, sendButtonMessage, sendListMessage } = require('../services/whatsapp.service');
const logger = require('../utils/logger');

const sendMessage = async (req, res, next) => {
    try {
        const { to, text, quotedMessageId, is_manual } = req.body;
        const result = await sendTextMessage(req.accountId, to, text, quotedMessageId, is_manual);

        // Handle error case depending on return structure from whatsapp-web.js
        if (!result || !result.id) {
            return res.status(500).json({ status: 'error', message: 'Failed to send message' });
        }
        res.json({ status: 'success', message: 'Message sent', id: result.id.id });
    } catch (err) {
        next(err);
    }
};

const reactMessage = async (req, res, next) => {
    // Assuming we pass reaction in body, but blueprint doesn't detail it much natively.
    try {
        const messageId = req.params.id;
        const reaction = req.body.reaction || '👍'; // fallback to thumbs up
        const client = require('../whatsapp/client').getClient();

        // finding the message to react to would normally require pulling chat/messages. 
        // but as a simplification, if we just want to send a reactor: (WIP)
        // This might need complex fetch handling in whatsapp-web.js
        res.json({ status: 'success', message: 'Reacted to message (Mock)' });
    } catch (err) {
        next(err);
    }
}

const sendInteractiveMessage = async (req, res, next) => {
    try {
        const { to, type, body, title, footer, buttons, buttonText, sections } = req.body;
        
        let result;
        if (type === 'button') {
            if (!buttons || !Array.isArray(buttons)) return res.status(400).json({ status: 'error', message: 'buttons array required for button message' });
            result = await sendButtonMessage(req.accountId, to, body, buttons, title, footer);
        } else if (type === 'list') {
            if (!sections || !Array.isArray(sections)) return res.status(400).json({ status: 'error', message: 'sections array required for list message' });
            result = await sendListMessage(req.accountId, to, body, buttonText || 'Menu', sections, title, footer);
        } else {
            return res.status(400).json({ status: 'error', message: 'Interactive type must be "button" or "list"' });
        }

        res.json({ status: 'success', message: `Interactive message (${type}) sent`, id: result?.id?.id });
    } catch (err) {
        next(err);
    }
};

module.exports = { sendMessage, reactMessage, sendInteractiveMessage };
