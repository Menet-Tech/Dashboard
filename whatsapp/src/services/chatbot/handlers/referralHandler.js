const { findCustomerByID, getReferredCount, getCustomerVouchers, withdrawReferral, convertReferralToVoucher, claimVoucher, toggleAutoApplyVoucher, notifyAdminViaWA, notifyAdminViaDiscord } = require('../../isp.service');
const { upsertSession, deleteSession } = require('../../../utils/database');
const { formatRp } = require('../utils');
const { getMenuReg } = require('../menus');
const logger = require('../../../utils/logger');

const sendReferralMenu = async (customerId, customerName, accountId, to, sendFn) => {
    const customer = await findCustomerByID(customerId);
    if (!customer) {
        await sendFn(accountId, to, 'Maaf, data pelanggan Anda tidak ditemukan.');
        return;
    }
    const count = await getReferredCount(customer.id);
    const balance = customer.referral_balance || 0;
    const voucher = customer.voucher_discount || 0;
    const code = customer.referral_code || '-';

    const activeVouchers = await getCustomerVouchers(customer.id);
    let voucherStatusText = "Tidak ada";
    if (activeVouchers.length > 0) {
        voucherStatusText = activeVouchers.map(cv => {
            const cycleText = cv.remaining_cycles > 0 ? `Sisa ${cv.remaining_cycles} bulan` : 'Permanen';
            return `${cv.voucher_code} (${formatRp(cv.voucher_amount)}, ${cycleText})`;
        }).join(', ');
    }
    const autoApplyText = customer.voucher_auto_apply === 1 ? 'ON (Otomatis digunakan)' : 'OFF (Manual)';

    const msg = `Halo *${customerName}*!
Berikut adalah informasi program Referral (Member-get-Member) & Voucher Anda:

👉 *Kode Referral Anda:* ${code}
👥 *Jumlah Teman yang Diajak:* ${count} orang
💰 *Saldo Referral (bisa dicairkan):* ${formatRp(balance)}
🎟️ *Voucher Referral Aktif:* ${formatRp(voucher)}
🎫 *Voucher Promosi Aktif:* ${voucherStatusText}
⚙️ *Auto-Apply Voucher:* ${autoApplyText}

*PILIHAN KLAIM REWARD REFERRAL & VOUCHER:*

💵 *A. Cairkan Saldo jadi Uang Tunai*
   Ketik: *TARIK [nominal]*
   (Contoh: *TARIK 50000*)

🎫 *B. Tukar Saldo jadi Voucher Diskon Tagihan*
   Ketik: *VOUCHER [nominal]*
   (Contoh: *VOUCHER 50000*)

🎁 *C. Klaim Kode Voucher Promosi*
   Ketik: *KLAIM [kode_voucher]*
   (Contoh: *KLAIM DISKON10K*)

⚙️ *D. Atur Auto-Apply Voucher*
   Ketik: *AUTO ON* atau *AUTO OFF*

_Ketik *menu* atau *0* untuk membatalkan dan kembali ke menu utama._`;

    await sendFn(accountId, to, msg);
};

const handleReferralState = async (ctx) => {
    const { rawFrom, text, lower, accountId, sendFn, contactName, state, formData, triggers } = ctx;
    const { triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin } = triggers;
    
    if (state === 'REG_REFERRAL_MENU') {
        const { customerId, customerName } = formData;
        const customer = await findCustomerByID(customerId);
        if (!customer) {
            deleteSession(rawFrom);
            await sendFn(accountId, rawFrom, "Sesi habis, silakan ketik *menu* kembali.");
            return;
        }

        const matchTarik = text.match(/^(tarik|cairkan|cair)\s+(\d+)$/i);
        const matchVoucher = text.match(/^(voucher|tukar|tukar_voucher)\s+(\d+)$/i);
        const matchKlaim = text.match(/^(klaim|claim)\s+(.+)$/i);
        const matchAuto = text.match(/^auto\s+(on|off)$/i);

        if (matchTarik) {
            const amount = parseInt(matchTarik[2], 10);
            if (amount <= 0) {
                await sendFn(accountId, rawFrom, "❌ Nominal penarikan harus lebih dari 0.");
                return;
            }
            if (amount > customer.referral_balance) {
                await sendFn(accountId, rawFrom, `❌ Saldo referral kamu tidak mencukupi.\nSaldo kamu: ${formatRp(customer.referral_balance)}\nNominal yang diminta: ${formatRp(amount)}`);
                return;
            }

            upsertSession(rawFrom, accountId, 'WAIT_WITHDRAW_METHOD', { ...formData, withdrawAmount: amount });
            await sendFn(accountId, rawFrom, `Pilih Metode Penarikan Saldo Referral Anda:\n\n1. Cash (Tunai - Admin akan mengantarkan ke rumah Anda)\n2. Transfer (Bank / E-Wallet)\n\nSilakan balas dengan angka *1* atau *2*:\n_(Ketik *menu* untuk membatalkan)_`);
        } else if (matchVoucher) {
            const amount = parseInt(matchVoucher[2], 10);
            if (amount <= 0) {
                await sendFn(accountId, rawFrom, "❌ Nominal voucher harus lebih dari 0.");
                return;
            }
            if (amount > customer.referral_balance) {
                await sendFn(accountId, rawFrom, `❌ Saldo referral kamu tidak mencukupi.\nSaldo kamu: ${formatRp(customer.referral_balance)}\nNominal yang diminta: ${formatRp(amount)}`);
                return;
            }

            try {
                await convertReferralToVoucher(customer.id, amount);
                await sendFn(accountId, rawFrom, `✅ *Tukar Voucher Diskon Berhasil!*\n\nSaldo sebesar *${formatRp(amount)}* telah berhasil ditukarkan menjadi voucher diskon.\nVoucher ini akan otomatis memotong tagihan bulanan Anda berikutnya.\n\nKetik *menu* untuk kembali.`);
                upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            } catch (err) {
                await sendFn(accountId, rawFrom, `❌ Gagal memproses penukaran voucher: ${err.message}`);
            }
        } else if (matchKlaim) {
            const code = matchKlaim[2].trim().toUpperCase();
            try {
                await claimVoucher(customer.id, code);
                await sendFn(accountId, rawFrom, `✅ *Klaim Voucher Berhasil!*\n\nVoucher *${code}* telah berhasil diklaim dan dikaitkan ke akun Anda.\n\nKetik *menu* untuk kembali.`);
                upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            } catch (err) {
                await sendFn(accountId, rawFrom, `❌ Gagal mengklaim voucher: ${err.message || 'Kode voucher tidak valid atau Anda sudah memiliki voucher aktif'}.`);
            }
        } else if (matchAuto) {
            const autoSetting = matchAuto[1].toLowerCase() === 'on';
            try {
                await toggleAutoApplyVoucher(customer.id, autoSetting);
                await sendFn(accountId, rawFrom, `✅ *Pengaturan Berhasil Diubah!*\n\nAuto-apply voucher Anda sekarang: *${autoSetting ? 'ON' : 'OFF'}*.\n\nKetik *menu* untuk kembali.`);
                upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            } catch (err) {
                await sendFn(accountId, rawFrom, `❌ Gagal mengubah pengaturan auto-apply: ${err.message}`);
            }
        } else {
            await sendReferralMenu(customerId, customerName, accountId, rawFrom, sendFn);
        }
        return;
    }

    if (state === 'WAIT_WITHDRAW_METHOD') {
        const { customerId, customerName, withdrawAmount } = formData;
        if (lower === 'batal' || lower === 'menu') {
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            const mRegText = await getMenuReg(customerName, rawFrom, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, formData.hasBills);
            await sendFn(accountId, rawFrom, `❌ Penarikan saldo dibatalkan.\n\n${mRegText}`);
            return;
        }

        if (text === '1') {
            try {
                await withdrawReferral(customerId, withdrawAmount, 'cash', '');
                const cleanPhone = rawFrom.replace(/@c\.us$/, '').replace(/^\+/, '');
                const linkNumber = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.replace(/^0/, '');
                const alertMsg = `💸 *Permintaan Penarikan Tunai (Cash) Referral*\nNama Pelanggan: ${customerName}\nNo HP: wa.me/+${linkNumber}\nNominal Pencairan: ${formatRp(withdrawAmount)}\nMetode: Cash\n\nMohon segera diproses manual ke rumah pelanggan.`;

                await notifyAdminViaWA({ phone: rawFrom, contactName: customerName, accountId }, sendFn, alertMsg);
                await notifyAdminViaDiscord({ phone: rawFrom, contactName: customerName }, alertMsg);

                await sendFn(accountId, rawFrom, `✅ *Penarikan Tunai (Cash) Berhasil Diajukan!*\n\nPermintaan penarikan saldo sebesar *${formatRp(withdrawAmount)}* secara tunai telah dicatat.\nAdmin kami akan berkunjung ke rumah Anda untuk memberikan dana tunai dan mengambil foto dokumentasi bukti serah terima.\n\nKetik *menu* untuk kembali.`);
                upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            } catch (err) {
                await sendFn(accountId, rawFrom, `❌ Gagal memproses penarikan: ${err.message}`);
                upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            }
        } else if (text === '2') {
            upsertSession(rawFrom, accountId, 'WAIT_WITHDRAW_TARGET', { ...formData });
            await sendFn(accountId, rawFrom, `Silakan masukkan nama Bank / E-Wallet dan Nomor Rekening tujuan Anda.\n(Contoh: *Seabank 901096534584 a.n. Irfan Dharmawan*)\n\n_(Ketik *menu* untuk membatalkan)_`);
        } else {
            await sendFn(accountId, rawFrom, `Pilihan tidak valid. Silakan balas dengan angka *1* atau *2*:\n\n1. Cash (Tunai - Admin akan mengantarkan ke rumah Anda)\n2. Transfer (Bank / E-Wallet)\n\n_(Ketik *menu* untuk membatalkan)_`);
        }
        return;
    }

    if (state === 'WAIT_WITHDRAW_TARGET') {
        const { customerId, customerName, withdrawAmount } = formData;
        if (lower === 'batal' || lower === 'menu') {
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            const mRegText = await getMenuReg(customerName, rawFrom, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, formData.hasBills);
            await sendFn(accountId, rawFrom, `❌ Penarikan saldo dibatalkan.\n\n${mRegText}`);
            return;
        }

        const paymentTarget = text;
        try {
            await withdrawReferral(customerId, withdrawAmount, 'transfer', paymentTarget);

            const cleanPhone = rawFrom.replace(/@c\.us$/, '').replace(/^\+/, '');
            const linkNumber = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.replace(/^0/, '');
            const alertMsg = `💸 *Permintaan Penarikan Transfer Referral*\nNama Pelanggan: ${customerName}\nNo HP: wa.me/+${linkNumber}\nNominal Pencairan: ${formatRp(withdrawAmount)}\nMetode: Transfer\nTujuan Rekening: ${paymentTarget}\n\nMohon segera diproses transfer dan unggah bukti ke dashboard.`;

            await notifyAdminViaWA({ phone: rawFrom, contactName: customerName, accountId }, sendFn, alertMsg);
            await notifyAdminViaDiscord({ phone: rawFrom, contactName: customerName }, alertMsg);

            await sendFn(accountId, rawFrom, `✅ *Penarikan Transfer Berhasil Diajukan!*\n\nPermintaan penarikan saldo sebesar *${formatRp(withdrawAmount)}* ke rekening *${paymentTarget}* telah dicatat.\nAdmin kami akan segera melakukan transfer dan mengunggah buktinya.\n\nKetik *menu* untuk kembali.`);
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
        } catch (err) {
            await sendFn(accountId, rawFrom, `❌ Gagal memproses penarikan: ${err.message}`);
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
        }
    }
};

module.exports = { sendReferralMenu, handleReferralState };
