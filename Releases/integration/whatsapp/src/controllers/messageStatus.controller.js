const { getMessages, getMessageById } = require('../utils/database');

const listMessages = (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const messages = getMessages(limit, offset);
    res.json({ status: 'success', count: messages.length, data: messages });
};

const getStatus = (req, res) => {
    const msg = getMessageById(req.params.id);
    if (!msg) return res.status(404).json({ status: 'error', message: 'Pesan tidak ditemukan' });
    res.json({ status: 'success', data: msg });
};

module.exports = { listMessages, getStatus };
