const { sendMediaMessage } = require('../services/whatsapp.service');

const sendMedia = async (req, res, next) => {
    try {
        const { to, caption } = req.body;
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const result = await sendMediaMessage(req.accountId, to, filePath, caption);

        // Kita biarkan file berada di temp (akan otomatis dihapus oleh fileHandler.js cleanup)
        res.json({ status: 'success', message: 'Media sent', id: result?.key?.id });
    } catch (err) {
        next(err);
    }
};

module.exports = { sendMedia };
