const { addWebhookUrl, removeWebhookUrl, getAllWebhookUrls } = require('../services/webhook.service');

const registerWebhook = (req, res, next) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ status: 'error', message: 'URL is required' });
        }
        addWebhookUrl(url);
        res.json({ status: 'success', message: 'Webhook registered', url });
    } catch (err) {
        next(err);
    }
};

const deleteWebhook = (req, res, next) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ status: 'error', message: 'URL is required' });
        }
        removeWebhookUrl(url);
        res.json({ status: 'success', message: 'Webhook removed', url });
    } catch (err) {
        next(err);
    }
};

const getWebhooks = (req, res, next) => {
    try {
        const urls = getAllWebhookUrls();
        res.json({ status: 'success', data: urls });
    } catch (err) {
        next(err);
    }
};

module.exports = { registerWebhook, deleteWebhook, getWebhooks };
