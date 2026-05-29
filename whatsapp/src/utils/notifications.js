const axios = require('axios');
const logger = require('./logger');

const sendTelegramAlert = async (message) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) return;

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await axios.post(url, {
            chat_id: chatId,
            text: `[WA Gateway Alert]\n${message}`
        });
    } catch (error) {
        logger.error('Failed to send Telegram alert:', error.message);
    }
};

module.exports = { sendTelegramAlert };
