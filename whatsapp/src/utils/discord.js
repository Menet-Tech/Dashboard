const logger = require('./logger');

const sendDiscordNotification = async (message) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (err) {
        logger.error('Failed to send Discord notification: ' + err.message);
    }
};

module.exports = { sendDiscordNotification };
