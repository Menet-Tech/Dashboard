const { isReady } = require('../whatsapp/client');

const readinessMiddleware = (req, res, next) => {
    const accountId = req.accountId || 'default';
    if (!isReady(accountId)) {
        return res.status(503).json({ status: 'error', message: `WhatsApp client [${accountId}] not ready yet` });
    }
    next();
};

module.exports = { readinessMiddleware };
