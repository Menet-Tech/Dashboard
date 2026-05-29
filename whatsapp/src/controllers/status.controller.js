const { getClient, isReady } = require('../whatsapp/client');

const getStatus = (req, res, next) => {
    try {
        const ready = isReady();
        if (!ready) {
            return res.json({ status: 'ok', whatsapp_ready: false });
        }

        // Asumsikan kita punya client info
        const client = getClient();
        const info = client.info || {};
        res.json({
            status: 'ok',
            whatsapp_ready: true,
            user: info.pushname || 'Unknown',
            phone: info.wid ? info.wid._serialized : 'Unknown',
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getStatus };
