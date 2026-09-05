const logger = require('../utils/logger');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { sendTextMessage, sendMediaMessage } = require('./whatsapp.service');
const {
    getSettings,
    findCustomersByPhone,
    getActiveBill,
    getPendingConfirmation,
    uploadProofBase64,
    createPaymentConfirmation,
    approvePaymentConfirmation,
    rejectPaymentConfirmation,
    closeTicketByConfId,
    createTicket,
    getTemplateByTrigger
} = require('./isp.service');
const { renderTemplate } = require('./chatbot/utils');
const path = require('path');

async function handleAdminPaymentCommand(command, confId, accountId, realFrom) {
    try {
        if (command === 'acc') {
            await approvePaymentConfirmation(confId);
            await sendTextMessage(accountId, realFrom, `✅ Konfirmasi #${confId} berhasil di-APPROVE. Tagihan telah lunas.`);
        } else if (command === 'tolak') {
            await rejectPaymentConfirmation(confId);
            await sendTextMessage(accountId, realFrom, `❌ Konfirmasi #${confId} berhasil di-TOLAK.`);
        }

        // Close the associated ticket
        try {
            await closeTicketByConfId(confId);
        } catch (e) {
            logger.error(`Failed to close ticket for ConfID ${confId}:`, e.message);
        }
        return true;
    } catch (cmdErr) {
        await sendTextMessage(accountId, realFrom, `⚠️ Gagal memproses perintah: ${cmdErr.message}`);
        return true;
    }
}

async function handlePaymentProofUpload(msg, accountId, realFrom, messageBody) {
    try {
        const customersList = await findCustomersByPhone(realFrom);
        const unpaidBills = [];
        for (const cust of customersList) {
            if (cust.is_trial) continue;
            const bill = await getActiveBill(cust.id);
            if (bill && bill.status === 'belum_bayar') {
                const pendingConf = await getPendingConfirmation(bill.id);
                if (!pendingConf) {
                    unpaidBills.push({ customer: cust, bill });
                }
            }
        }

        if (unpaidBills.length > 0) {
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', { logger: require('pino')({level:'silent'}) });
                let mimetype = msg.message?.imageMessage?.mimetype || msg.message?.documentMessage?.mimetype || 'image/jpeg';
                let filename = msg.message?.documentMessage?.fileName || 'payment_proof.png';
                
                const uploadRes = await uploadProofBase64(buffer.toString('base64'), mimetype, filename);
                const proofPath = uploadRes.proof_path;

                const primary = unpaidBills[0];
                const linkedIds = unpaidBills.slice(1).map(item => item.bill.id).join(',');
                const confRes = await createPaymentConfirmation(primary.bill.id, primary.customer.id, proofPath, messageBody || "Diunggah via WA (Chatbot Off)", linkedIds);
                const confId = confRes?.id;

                // Calculate customerPhone for ticket and caption
                const customerPhone = (primary.customer.whatsapp || primary.customer.phone || '').replace(/@(c\.us|s\.whatsapp\.net|lid)$/, '').replace(/[+\-\s]/g, '').replace(/^0/, '62');

                // Create Ticket
                let ticketId = '-';
                if (confId) {
                    const ticketData = {
                        pelanggan_id: primary.customer.id,
                        nama: primary.customer.name,
                        no_hp: customerPhone,
                        alamat: primary.customer.alamat || '-',
                        kendala: `Konfirmasi Pembayaran - Tagihan ${primary.bill.period || primary.bill.periode || '-'} - ConfID ${confId}`,
                        status: 'open'
                    };
                    const newTicket = await createTicket(ticketData);
                    if (newTicket) ticketId = newTicket.id;
                }

                // Forward to Admin WA
                try {
                    const settings = await getSettings().catch(() => ({}));
                    const adminNumbers = (settings.wa_admin_numbers || '')
                        .split(',')
                        .map(n => n.trim().replace(/@(s\.whatsapp\.net|lid)$/, '').replace(/[+\-\s]/g, '').replace(/^0/, '62'))
                        .filter(Boolean);
                        
                    const caption = `🎫 *TICKET BARU: Konfirmasi Pembayaran*\n\n` +
                                    `ID Tiket: #${ticketId}\n` +
                                    `Pelanggan: ${primary.customer.name}\n` +
                                    `No WA: wa.me/+${customerPhone}\n` +
                                    `Username PPPoE: ${primary.customer.user_pppoe || '-'}\n` +
                                    `Tagihan: ${primary.bill.period || primary.bill.periode || '-'}\n` +
                                    `Total: Rp ${primary.bill.amount || primary.bill.harga || '-'}\n` +
                                    `Deskripsi: ${primary.customer.deskripsi || '-'}\n` +
                                    `Catatan: ${messageBody || '-'}\n\n` +
                                    `📝 *Admin, balas pesan ini dengan format:*\n` +
                                    `*ACC ${confId}* untuk menyetujui, atau\n` +
                                    `*TOLAK ${confId}* untuk menolak.`;

                    const fullPath = path.join(__dirname, '../../../backend/storage', proofPath.replace(/^\/?/, ''));
                    
                    for (const admin of adminNumbers) {
                        await sendMediaMessage(accountId, admin, fullPath, caption, null, true);
                    }
                } catch (forwardErr) {
                    logger.error(`[${accountId}] Failed to forward payment proof to admin: ${forwardErr.message}`);
                }

                try {
                    const successTpl = await getTemplateByTrigger('auto_reply_payment_proof').catch(() => null);
                    const successMsg = successTpl 
                        ? renderTemplate(successTpl.content || successTpl.isi_template, { nama: primary.customer.name })
                        : "Terima kasih! Bukti transfer Anda telah kami terima dan sedang dalam proses verifikasi (pending) oleh admin. Terimakasih";
                    
                    await sendTextMessage(accountId, realFrom, successMsg);
                } catch (replyErr) {
                    logger.error(`[${accountId}] Gagal mengirim balasan konfirmasi (Chatbot Off): ${replyErr.message}`);
                }
                logger.info(`[${accountId}] Sukses memproses bukti transfer dari ${realFrom} (Chatbot Off)`);
            } catch (downloadErr) {
                logger.error(`[${accountId}] Gagal mendownload media: ${downloadErr.message}`);
            }
        }
    } catch (err) {
        logger.error(`[${accountId}] Gagal memproses bukti transfer (Chatbot Off) untuk ${realFrom}: ${err.message}`);
    }
}

module.exports = {
    handleAdminPaymentCommand,
    handlePaymentProofUpload
};
