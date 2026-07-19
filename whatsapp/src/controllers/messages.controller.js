const { sendTextMessage, sendButtonMessage, sendListMessage } = require('../services/whatsapp.service');
const logger = require('../utils/logger');
const { getDb } = require('../utils/database');

// Idempotency cache: prevents duplicate sends when the backend retries due to
// a transient 500 error (e.g. result.id missing even though message was sent).
// Key: X-Idempotency-Key header value  Value: response object  TTL: 5 minutes
const idempotencyCache = new Map();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of idempotencyCache.entries()) {
        if (now - entry.ts > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(key);
    }
}, 60_000);

const sendMessage = async (req, res, next) => {
    try {
        const idempotencyKey = req.headers['x-idempotency-key'];

        // Return cached response immediately if this is a retry for the same send attempt.
        if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
            const cached = idempotencyCache.get(idempotencyKey);
            logger.info(`[Messages] Idempotency hit for key ${idempotencyKey} — returning cached response`);
            return res.json(cached.response);
        }

        const { to, text, quotedMessageId, is_manual } = req.body;

        // Record time just before sending so we can verify in DB afterward
        const sendAttemptTime = new Date().toISOString();

        const result = await sendTextMessage(req.accountId, to, text, quotedMessageId, is_manual);

        // whatsapp-web.js sometimes returns null/undefined even after successfully
        // delivering the message (confirmed: message appears in wa_gateway.db messages table).
        // Check the DB to determine if the message was truly sent.
        let messageId = result?.id?.id || result?.id?._serialized || null;

        if (!messageId && !result) {
            // result is null — verify if the message was saved to the messages DB
            // (which happens in sendTextMessage's saveMessage call before returning result)
            const db = getDb();
            if (db) {
                const row = db.prepare(
                    `SELECT id, wa_message_id FROM messages 
                     WHERE to_number = ? AND direction = 'outbound' 
                       AND body = ? AND created_at >= ?
                     ORDER BY rowid DESC LIMIT 1`
                ).get(to, text, sendAttemptTime.substring(0, 16)); // match by minute

                if (row) {
                    logger.info(`[Messages] client.sendMessage returned null but message found in DB (id=${row.id}). Treating as success.`);
                    messageId = row.wa_message_id || row.id;
                } else {
                    logger.warn(`[Messages] client.sendMessage returned null and no DB record found for to=${to}. Treating as failure.`);
                    return res.status(500).json({ status: 'error', message: 'Failed to send message: no result from client' });
                }
            } else {
                logger.warn('[Messages] client.sendMessage returned null and DB not available. Treating as failure.');
                return res.status(500).json({ status: 'error', message: 'Failed to send message: no result from client' });
            }
        }

        const responseBody = { status: 'success', message: 'Message sent', id: messageId };

        // Cache successful send so retries don't cause duplicate delivery.
        if (idempotencyKey) {
            idempotencyCache.set(idempotencyKey, { response: responseBody, ts: Date.now() });
        }

        res.json(responseBody);
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
