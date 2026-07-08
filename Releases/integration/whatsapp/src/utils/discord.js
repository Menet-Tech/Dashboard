const logger = require('./logger');

const sendDiscordNotification = async (message) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
        if (!res.ok) {
            logger.warn(`Discord webhook responded with status ${res.status}: ${message.substring(0, 80)}`);
        }
    } catch (err) {
        logger.error('Failed to send Discord notification: ' + err.message);
    }
};

module.exports = { sendDiscordNotification };
