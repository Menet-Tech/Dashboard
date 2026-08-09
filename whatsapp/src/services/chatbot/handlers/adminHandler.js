const { notifyAdminViaDiscord } = require('../../isp.service');
const { deleteSession } = require('../../../utils/database');
const logger = require('../../../utils/logger');
const { getActiveTicket, getTicket, replyToTicket } = require('../../isp.service');

const requestAdmin = async (rawFrom, accountId, contactName, sendFn) => {
    // Send alert to technicians
    const alertMsg = `⚠️ *Alert Admin:* Pelanggan *${contactName}* (${rawFrom.replace(/@s\.whatsapp\.net$/, '')}) meminta bantuan admin.`;
    try {
        await sendFn(accountId, '628987700897@s.whatsapp.net', alertMsg);
    } catch (e) {
        logger.error('Failed to notify Elam via WA:', e.message);
    }
    try {
        await sendFn(accountId, '6289621743796@s.whatsapp.net', alertMsg);
    } catch (e) {
        logger.error('Failed to notify Ipong via WA:', e.message);
    }

    // Send alert to Discord
    try {
        const discordMsg = `<@923237802618007562> <@173778121059860480> **Alert Admin**: Pelanggan **${contactName}** (${rawFrom.replace(/@c\.us$/, '')}) meminta bantuan admin.`;
        await notifyAdminViaDiscord({ phone: rawFrom, contactName }, discordMsg);
    } catch (e) {
        logger.error('Failed to notify Discord:', e.message);
    }

    // Reply to user
    await sendFn(accountId, rawFrom, "baik, tunggu sebentar ya, kami akan menghubungin admin");
    await sendFn(accountId, rawFrom, "baik kami akan menghubungi segera menghubungi admin, mohon di tunggu ya");

    // Reset session
    deleteSession(rawFrom);
};

const handleWaitingAdmin = async (ctx) => {
    const { rawFrom, text, accountId, sendFn, formData } = ctx;
    const { activeTicketId } = formData;
    
    if (activeTicketId) {
        try {
            await replyToTicket(activeTicketId, 'customer', text);
            const ticket = await getTicket(activeTicketId);
            const hasAdminReplied = ticket && ticket.messages && ticket.messages.some(m => m.sender_type === 'admin');
            if (!hasAdminReplied) {
                await sendFn(accountId, rawFrom, `💬 *Laporan Terkirim:* "${text}"\nPesan Anda telah diteruskan ke teknisi.\n\n_(Ketik *menu* atau *0* untuk kembali ke menu utama)_`);
            }
        } catch (err) {
            logger.error('[Chatbot] Failed to forward message to ticket:', err.message);
            await sendFn(accountId, rawFrom, `Pesanmu sudah kami sampaikan ke admin ya 😊\nAdmin akan segera membalasmu.\n\nKetik *menu* untuk kembali ke menu utama.`);
        }
    } else {
        const activeTicket = await getActiveTicket(rawFrom);
        if (activeTicket) {
            try {
                await replyToTicket(activeTicket.id, 'customer', text);
                const { upsertSession } = require('../../../utils/database');
                upsertSession(rawFrom, accountId, 'WAITING_ADMIN', { ...formData, activeTicketId: activeTicket.id });
                
                const ticket = await getTicket(activeTicket.id);
                const hasAdminReplied = ticket && ticket.messages && ticket.messages.some(m => m.sender_type === 'admin');
                if (!hasAdminReplied) {
                    await sendFn(accountId, rawFrom, `💬 *Laporan Terkirim:* "${text}"\nPesan Anda telah diteruskan ke teknisi.\n\n_(Ketik *menu* atau *0* untuk kembali ke menu utama)_`);
                }
            } catch (err) {
                logger.error('[Chatbot] Failed to forward message to active ticket:', err.message);
                await sendFn(accountId, rawFrom, `Pesanmu sudah kami sampaikan ke admin ya 😊\nAdmin akan segera membalasmu.\n\nKetik *menu* untuk kembali ke menu utama.`);
            }
        } else {
            await sendFn(accountId, rawFrom, `Pesanmu sudah kami sampaikan ke admin ya 😊\nAdmin akan segera membalasmu.\n\nKetik *menu* untuk kembali ke menu utama.`);
        }
    }
};

module.exports = { requestAdmin, handleWaitingAdmin };
