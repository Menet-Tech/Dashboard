const { getClient, isReady } = require('../whatsapp/client');

const getStatus = (req, res, next) => {
    try {
        const accountId = req.accountId || 'default';
        const ready = isReady(accountId);
        if (!ready) {
            return res.json({ status: 'ok', account_id: accountId, whatsapp_ready: false });
        }

        const client = getClient(accountId);
        const info = client.info || {};
        res.json({
            status: 'ok',
            account_id: accountId,
            whatsapp_ready: true,
            user: info.pushname || 'Unknown',
            phone: info.wid ? info.wid._serialized : 'Unknown',
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getStatus };
