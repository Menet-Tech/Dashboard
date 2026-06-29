const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Mendapatkan daftar URL dari environment variable (JSON array)
const getWebhookUrls = () => {
    const envUrls = process.env.WEBHOOK_URLS || '[]';
    try {
        return JSON.parse(envUrls);
    } catch (err) {
        logger.warn('Failed to parse WEBHOOK_URLS, using empty array');
        return [];
    }
};

// Menyimpan URL tambahan secara dinamis
let dynamicUrls = [];

const addWebhookUrl = (url) => {
    if (!dynamicUrls.includes(url)) {
        dynamicUrls.push(url);
        logger.info(`Webhook URL added: ${url}`);
    }
};

const removeWebhookUrl = (url) => {
    dynamicUrls = dynamicUrls.filter(u => u !== url);
    logger.info(`Webhook URL removed: ${url}`);
};

const getAllWebhookUrls = () => {
    return [...new Set([...getWebhookUrls(), ...dynamicUrls])];
};

/**
 * Buat HMAC-SHA256 signature dari payload JSON
 * Header: X-Webhook-Signature: sha256=<hmac>
 */
const createSignature = (payloadStr) => {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) return null;
    return 'sha256=' + crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
};

const handleIncomingMessage = async (message, mediaUrl = null) => {
    const urls = getAllWebhookUrls();
    if (urls.length === 0) return;

    const payload = {
        event: 'message',
        data: {
            id: message.id._serialized,
            from: message.from,
            body: message.body,
            type: message.type,
            timestamp: message.timestamp,
            hasMedia: message.hasMedia,
            mediaUrl: mediaUrl,
        }
    };

    const payloadStr = JSON.stringify(payload);
    const signature = createSignature(payloadStr);

    const headers = { 'Content-Type': 'application/json' };
    if (signature) headers['X-Webhook-Signature'] = signature;

    await Promise.allSettled(urls.map(url =>
        axios.post(url, payload, { timeout: 5000, headers }).catch(err => {
            logger.error(`Failed to send webhook to ${url}: ${err.message}`);
        })
    ));
};

module.exports = { handleIncomingMessage, addWebhookUrl, removeWebhookUrl, getAllWebhookUrls };
