const { findCustomerByID, findCustomersByPhone, getLatestBill, getActiveBill, getPendingConfirmation, createPaymentConfirmation } = require('../../isp.service');
const { getTemplateByTrigger } = require('../../isp.service'); // Using isp.service directly for templates is okay here or use templates.js
const { renderTemplate, formatDate, formatRp } = require('../utils');
const { upsertSession, deleteSession } = require('../../../utils/database');
const { getMenuReg } = require('../menus');
const logger = require('../../../utils/logger');

const sendBillInfo = async (customerId, customerName, accountId, to, sendFn) => {
    const customersList = await findCustomersByPhone(to);
    customersList.sort((a, b) => a.id - b.id);
    
    if (customersList.length === 0) {
        const customer = await findCustomerByID(customerId);
        if (customer) {
            customersList.push(customer);
        }
    }

    if (customersList.length === 0) {
        await sendFn(accountId, to, "Maaf, data pelanggan Anda tidak ditemukan.");
        return;
    }

    const headerTpl = await getTemplateByTrigger('chatbot_tagihan_header');
    const footerTpl = await getTemplateByTrigger('chatbot_tagihan_footer');

    const allBillsInfo = [];
    let hasUnpaid = false;
    let totalUnpaidAmount = 0;
    let totalUnpaidDiscount = 0;
    const unpaidBillItems = [];
    let latestDueDate = null;
    let latestPeriod = "";

    for (const cust of customersList) {
        if (cust.is_trial) {
            let remainingDays = cust.trial_days || 3;
            if (cust.trial_started_at) {
                const start = new Date(cust.trial_started_at);
                const now = new Date();
                const elapsedMs = now.getTime() - start.getTime();
                const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
                remainingDays = Math.max(0, cust.trial_days - elapsedDays);
            }
            allBillsInfo.push({
                customer: cust, bill: null, isTrial: true, remainingDays,
                statusText: `Masa Trial (${remainingDays} hari tersisa)`
            });
            continue;
        }

        const bill = await getLatestBill(cust.id);
        if (!bill) {
            allBillsInfo.push({ customer: cust, bill: null, isTrial: false, statusText: "Belum Ada Tagihan" });
            continue;
        }

        let statusText = "";
        if (bill.status === 'lunas') {
            statusText = "Lunas";
        } else {
            const pendingConf = await getPendingConfirmation(bill.id);
            if (pendingConf) {
                statusText = pendingConf.bukti_transfer ? "Proses Verifikasi (Pending)" : "Proses Pengecekan";
            } else {
                const isDue = new Date(bill.jatuh_tempo) < new Date();
                statusText = isDue ? "Jatuh Tempo (Belum Dibayar)" : "Belum Dibayar";
                hasUnpaid = true;
                totalUnpaidAmount += Number(bill.nominal);
                totalUnpaidDiscount += Number(bill.diskon || 0) + Number(bill.diskon_referral || 0);
                unpaidBillItems.push({ customer: cust, bill });
                latestDueDate = bill.jatuh_tempo;
                latestPeriod = bill.periode;
            }
        }

        allBillsInfo.push({ customer: cust, bill, isTrial: false, statusText });
    }

    const primaryCustomer = customersList[0];
    let msg = headerTpl ? renderTemplate(headerTpl.content || headerTpl.isi_template, { nama: primaryCustomer.name }) + '\n\n' : `Halo ${primaryCustomer.name}, berikut detail tagihan Anda:\n\n`;
    
    for (let i = 0; i < allBillsInfo.length; i++) {
        const item = allBillsInfo[i];
        if (item.isTrial || !item.bill) {
            msg += `Nama Terdaftar: ${item.customer.name}\nPaket: ${item.customer.package_name || (item.isTrial ? 'Trial Internet' : 'Internet')}\nStatus: ${item.statusText}`;
        } else {
            msg += `Nama Terdaftar: ${item.customer.name}\nPaket: ${item.customer.package_name || item.bill.package_name || 'Internet'}\nPeriode: ${item.bill.periode}\nNominal: ${formatRp(item.bill.nominal)}\nJatuh Tempo: ${formatDate(item.bill.jatuh_tempo)}\nStatus Tagihan: ${item.statusText}`;
        }
        if (i < allBillsInfo.length - 1) msg += `\n\n--------------------\n\n`;
    }

    if (hasUnpaid) {
        msg += `\n\n====================\n\n`;
        if (unpaidBillItems.length > 1) {
            let detailBlock = "";
            for (const item of unpaidBillItems) {
                const itemNominal = Number(item.bill.nominal);
                const itemDiscount = Number(item.bill.diskon || 0) + Number(item.bill.diskon_referral || 0);
                const originalPrice = itemNominal + itemDiscount;
                detailBlock += `Nama : ${item.customer.name}\n> Paket: ${item.customer.package_name || item.bill.package_name || 'Internet'}\n> Harga: ${formatRp(originalPrice)}.\n`;
                if (itemDiscount > 0) detailBlock += `> Diskon: ${formatRp(itemDiscount)}.\n`;
                detailBlock += `\n`;
            }
            msg += `Tagihan Anda periode ${latestPeriod} sebesar ${formatRp(totalUnpaidAmount)}., dengan detail berikut\n\n${detailBlock}Total Tagihan: ${formatRp(totalUnpaidAmount)}.\n\n`;
        } else {
            msg += `Total Tagihan Belum Dibayar: ${formatRp(totalUnpaidAmount)}\n\n`;
        }

        if (footerTpl) {
            msg += renderTemplate(footerTpl.content || footerTpl.isi_template, { jatuh_tempo: formatDate(latestDueDate) });
        } else {
            msg += `Mohon lakukan pembayaran sebelum tanggal ${formatDate(latestDueDate)} agar terhindar dari Pembatasan Layanan.

Rekening Pembayaran:
Bank Mandiri
1570006636691

Shopeepay, gopay
089621743796

Seabank
901096534584

a.n. Irfan Dharmawan

Untuk konfirmasi pembayaran & Pengaduan kendala dapat menghubungi kami melalui Pesan ini, atau Nomor di bawah ini.
087782297657 - Menet CS
08987700897 - Elam
089621743796 - Ipong

Atas perhatian dan kerja samanya, kami ucapkan terima kasih.
Hormat kami,
Tim Billing — MeNet Tech`;
        }
    }

    await sendFn(accountId, to, msg);
    await sendFn(accountId, to, 'Ketik *menu* untuk kembali ke menu utama.');
};

const handlePaymentStates = async (ctx) => {
    const { rawFrom, text, lower, accountId, sendFn, contactName, rawMsg, state, formData, triggers } = ctx;
    const { triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin } = triggers;
    
    if (state === 'WAITING_PAYMENT_METHOD') {
        const { unpaidBills } = formData;
        if (!unpaidBills || unpaidBills.length === 0) {
            deleteSession(rawFrom);
            await sendFn(accountId, rawFrom, "Sesi habis, silakan ketik *menu*.");
            return;
        }

        if (lower === 'batal' || lower === 'cancel' || lower === '0' || lower === 'menu') {
            upsertSession(rawFrom, accountId, 'REG_MENU', { ...formData });
            const mRegText = await getMenuReg(formData.customerName || contactName, rawFrom, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, formData.hasBills);
            await sendFn(accountId, rawFrom, `❌ Konfirmasi pembayaran dibatalkan.\n\n${mRegText}`);
            return;
        }

        if (text === '1' || lower.includes('transfer')) {
            upsertSession(rawFrom, accountId, 'WAITING_PROOF', { ...formData });
            await sendFn(accountId, rawFrom, "Silakan kirimkan foto bukti pembayaran / bukti transfer Anda:\n_(Ketik 'batal' untuk membatalkan)_");
        } else if (text === '2' || lower.includes('cash')) {
            try {
                if (unpaidBills.length > 0) {
                    const primary = unpaidBills[0];
                    const linkedIds = unpaidBills.slice(1).map(b => b.billId || b.id).join(',');
                    await createPaymentConfirmation(primary.billId || primary.id, primary.customerId || primary.customer_id, null, "Cash", linkedIds);
                }
                upsertSession(rawFrom, accountId, 'REG_MENU', { ...formData });
                await sendFn(accountId, rawFrom, "baik, akan kami konfirmasi");
            } catch (err) {
                logger.error('[Chatbot] Failed to handle cash payment confirmation:', err.message);
                await sendFn(accountId, rawFrom, `❌ Gagal mengirim konfirmasi: ${err.message}. Silakan coba lagi.`);
            }
        } else {
            await sendFn(accountId, rawFrom, "Pilihan tidak valid. Silakan balas dengan angka 1 (Transfer) atau 2 (Cash):\n_(Ketik 'batal' untuk membatalkan)_");
        }
        return;
    }

    if (state === 'WAITING_PROOF') {
        const { unpaidBills } = formData;
        if (!unpaidBills || unpaidBills.length === 0) {
            deleteSession(rawFrom);
            await sendFn(accountId, rawFrom, "Sesi habis, silakan ketik *menu*.");
            return;
        }

        if (lower === 'batal' || lower === 'cancel' || lower === '0' || lower === 'menu') {
            upsertSession(rawFrom, accountId, 'REG_MENU', { ...formData });
            const mRegText = await getMenuReg(formData.customerName || contactName, rawFrom, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, formData.hasBills);
            await sendFn(accountId, rawFrom, `❌ Konfirmasi pembayaran dibatalkan.\n\n${mRegText}`);
            return;
        }

        let hasMedia = rawMsg && (rawMsg.hasMedia || rawMsg.type === 'image');
        let isCashText = lower.includes('ya saya sudah bayar') || lower.includes('saya sudah bayar') || lower.includes('sudah bayar');

        if (hasMedia) {
            await sendFn(accountId, rawFrom, "🔄 Sedang memproses dan mengunggah bukti transfer Anda. Mohon tunggu...");
            try {
                const media = await rawMsg.downloadMedia();
                if (media && media.data) {
                    const { uploadProofBase64 } = require('../../isp.service');
                    const uploadRes = await uploadProofBase64(media.data, media.mimetype, media.filename || 'payment_proof.png');
                    const proofPath = uploadRes.proof_path;
                    
                    if (unpaidBills.length > 0) {
                        const primary = unpaidBills[0];
                        const linkedIds = unpaidBills.slice(1).map(b => b.billId || b.id).join(',');
                        await createPaymentConfirmation(primary.billId || primary.id, primary.customerId || primary.customer_id, proofPath, text || "Diunggah via chatbot WA", linkedIds);
                    }

                    upsertSession(rawFrom, accountId, 'REG_MENU', { ...formData });
                    await sendFn(accountId, rawFrom, "✅ *Terima kasih!* Bukti transfer Anda telah diterima dan sedang dalam proses verifikasi (pending) oleh admin.\n\nKetik *menu* untuk kembali.");
                } else {
                    await sendFn(accountId, rawFrom, "❌ Gagal mengunduh gambar bukti transfer. Silakan kirim ulang bukti transfer Anda.");
                }
            } catch (err) {
                logger.error('[Chatbot] Failed to handle payment proof upload:', err.message);
                await sendFn(accountId, rawFrom, `❌ Gagal memproses bukti transfer: ${err.message}. Silakan coba lagi.`);
            }
        } else if (isCashText) {
            try {
                if (unpaidBills.length > 0) {
                    const primary = unpaidBills[0];
                    const linkedIds = unpaidBills.slice(1).map(b => b.billId || b.id).join(',');
                    await createPaymentConfirmation(primary.billId || primary.id, primary.customerId || primary.customer_id, null, text, linkedIds);
                }
                upsertSession(rawFrom, accountId, 'REG_MENU', { ...formData });
                await sendFn(accountId, rawFrom, "✅ *Konfirmasi Dicatat:* Pembayaran Anda sedang dalam proses pengecekan oleh admin.\n\nKetik *menu* untuk kembali.");
            } catch (err) {
                logger.error('[Chatbot] Failed to handle cash payment confirmation:', err.message);
                await sendFn(accountId, rawFrom, `❌ Gagal mengirim konfirmasi: ${err.message}. Silakan coba lagi.`);
            }
        } else {
            // Abaikan teks selain media / konfirmasi cash, tetep nunggu bukti
            // Return nothing to keep waiting
        }
    }
};

module.exports = { sendBillInfo, handlePaymentStates };
