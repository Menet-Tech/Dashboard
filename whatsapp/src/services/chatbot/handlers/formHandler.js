const { getPackageList, createTicket, updateCustomerWifi, notifyAdminViaWA, notifyAdminViaDiscord, getTemplateByTrigger, saveChatbotFormToBackend } = require('../../isp.service');
const { saveContactForm, upsertSession } = require('../../../utils/database');
const { renderTemplate, formatRp } = require('../utils');
const { getMenuReg } = require('../menus');
const logger = require('../../../utils/logger');

const REG_STEPS = [
    { key: 'nama',       prompt: 'silahkan lengkapi form ini\nnama : ' },
    { key: 'no_hp',      prompt: 'no hp : ' },
    { key: 'alamat',     prompt: 'alamat : ' },
    { key: 'paket',      prompt: 'Silakan masukkan paket yang kamu pilih:' },
    { key: 'ssid',       prompt: 'nama wifi (ssid) : ' },
    { key: 'password',   prompt: 'password wifi : ' },
    { key: 'referral',   prompt: 'mengetahui kami dari siapa atau berikan kode referal : ' },
    { key: 'isp_lain',   prompt: 'apakah saat ini masih langganan ke wifi (ISP) lain : ' },
];

const SUPPORT_STEPS = [
    { key: 'nama',    prompt: 'halo, kami mohon maaf jika, kamu memiliki masalah, silahkan lengkapi masalah tersebut, akan kami sampaikan ke teknisi kami\nNama : ' },
    { key: 'alamat',  prompt: 'Alamat : ' },
    { key: 'kendala', prompt: 'Kendala : ' },
];

const handleRegistrationForm = async (ctx) => {
    const { rawFrom, text, accountId, sendFn, state, formData } = ctx;
    const step = parseInt(state.replace('REG_FORM_', ''), 10);
    
    let valToSave = text;
    if (REG_STEPS[step].key === 'paket') {
        const num = parseInt(text.trim(), 10);
        if (!isNaN(num)) {
            try {
                const packages = await getPackageList();
                if (packages && num > 0 && num <= packages.length) {
                    const selectedPkg = packages[num - 1];
                    valToSave = selectedPkg.nama || selectedPkg.name;
                }
            } catch (err) {
                logger.error('[Chatbot] failed to resolve package selection index:', err.message);
            }
        }
    }
    
    const updatedForm = { ...formData, [REG_STEPS[step].key]: valToSave };

    if (step < REG_STEPS.length - 1) {
        upsertSession(rawFrom, accountId, `REG_FORM_${step + 1}`, updatedForm);
        
        if (REG_STEPS[step + 1].key === 'paket') {
            try {
                const packages = await getPackageList();
                if (packages && packages.length > 0) {
                    let promptMsg = "Silakan masukkan paket yang kamu pilih:\n";
                    packages.forEach((pkg, index) => {
                        promptMsg += `${index + 1}. ${pkg.nama || pkg.name} - ${pkg.kecepatan_mbps || pkg.speed_mbps} Mbps (${formatRp(pkg.harga || pkg.price)})\n`;
                    });
                    promptMsg += "\nKamu cukup kirim nomor pilihan kamu (misal: 1, 2, atau 3) untuk memilih paket.";
                    await sendFn(accountId, rawFrom, promptMsg);
                } else {
                    await sendFn(accountId, rawFrom, REG_STEPS[step + 1].prompt);
                }
            } catch (err) {
                await sendFn(accountId, rawFrom, REG_STEPS[step + 1].prompt);
            }
        } else {
            await sendFn(accountId, rawFrom, REG_STEPS[step + 1].prompt);
        }
    } else {
        upsertSession(rawFrom, accountId, 'UNREG_MENU', {});
        saveContactForm('registration', rawFrom, accountId, { ...updatedForm, source: 'whatsapp' });
        saveChatbotFormToBackend('registration', rawFrom, accountId, { ...updatedForm, source: 'whatsapp' }).catch(() => {});

        const cleanPhone = rawFrom.replace(/@c\.us$/, '').replace(/^\+/, '');
        const linkNumber = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.replace(/^0/, '');
        const customMsg = `📝 *Pendaftaran Baru*\nNama: ${updatedForm.nama}\nNo HP: ${updatedForm.no_hp}\nAlamat: ${updatedForm.alamat}\nSSID: ${updatedForm.ssid}\nPassword: ${updatedForm.password}\nSponsor/Referral: ${updatedForm.referral}\nISP Lain: ${updatedForm.isp_lain}\nNomor WA: wa.me/+${linkNumber}`;

        await notifyAdminViaWA({ phone: rawFrom, contactName: updatedForm.nama, accountId }, sendFn, customMsg);
        await notifyAdminViaDiscord({ phone: rawFrom, contactName: updatedForm.nama }, customMsg);

        await sendFn(accountId, rawFrom, `✅ *Terima kasih, ${updatedForm.nama}!*\n\nData pendaftaranmu sudah kami terima. Admin kami akan segera menghubungimu.\n\n📌 *Pemasangan dilakukan setiap Sabtu & Minggu.*\n\nKetik *menu* untuk kembali ke menu utama.`);
    }
};

const handleSupportForm = async (ctx) => {
    const { rawFrom, text, accountId, sendFn, state, formData } = ctx;
    const step = parseInt(state.replace('SUPPORT_FORM_', ''), 10);
    const updatedForm = { ...formData, [SUPPORT_STEPS[step].key]: text };

    if (step < SUPPORT_STEPS.length - 1) {
        upsertSession(rawFrom, accountId, `SUPPORT_FORM_${step + 1}`, updatedForm);
        await sendFn(accountId, rawFrom, SUPPORT_STEPS[step + 1].prompt);
    } else {
        saveContactForm('support', rawFrom, accountId, updatedForm);
        saveChatbotFormToBackend('support', rawFrom, accountId, updatedForm).catch(() => {});

        const ticket = await createTicket({
            pelanggan_id: formData.customerId || null,
            nama: updatedForm.nama,
            no_hp: rawFrom,
            alamat: updatedForm.alamat,
            kendala: updatedForm.kendala
        });

        upsertSession(rawFrom, accountId, 'WAITING_ADMIN', { ...formData, activeTicketId: ticket ? ticket.id : null });

        const cleanPhone = rawFrom.replace(/@c\.us$/, '').replace(/^\+/, '');
        const linkNumber = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.replace(/^0/, '');
        
        let customMsg = '';
        const tpl = await getTemplateByTrigger('alert_teknisi');
        if (tpl) {
            customMsg = renderTemplate(tpl.content || tpl.isi_template, {
                nama: updatedForm.nama,
                alamat: updatedForm.alamat,
                kendala: updatedForm.kendala,
                no_hp: linkNumber
            });
        } else {
            customMsg = `🔧 *Laporan Kendala Baru*\nNama: ${updatedForm.nama}\nAlamat: ${updatedForm.alamat}\nKendala: ${updatedForm.kendala}\nNomor WA: wa.me/+${linkNumber}`;
        }

        await notifyAdminViaWA({ phone: rawFrom, contactName: updatedForm.nama, accountId }, sendFn, customMsg);
        await notifyAdminViaDiscord({ phone: rawFrom, contactName: updatedForm.nama }, customMsg);

        await sendFn(accountId, rawFrom, `✅ *Laporan kendalamu sudah kami terima!*\n\nTeknisi kami akan segera menghubungi dan membantu menyelesaikan masalahmu, ${updatedForm.nama}.\n\nKetik *menu* untuk kembali ke menu utama.`);
    }
};

const handleWifiForm = async (ctx) => {
    const { rawFrom, text, lower, accountId, sendFn, contactName, state, formData, triggers } = ctx;
    const { triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin } = triggers;
    const { customerId, customerName, newSsid } = formData;

    if (state === 'REG_WIFI_FORM_SSID') {
        if (lower === 'batal') {
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            const mRegText = await getMenuReg(customerName, rawFrom, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, formData.hasBills);
            await sendFn(accountId, rawFrom, `❌ Penggantian WiFi dibatalkan.\n\n${mRegText}`);
            return;
        }

        upsertSession(rawFrom, accountId, 'REG_WIFI_FORM_PWD', { ...formData, newSsid: text });
        await sendFn(accountId, rawFrom, `Nama WiFi (SSID) diset ke: *${text}*\n\nSekarang masukkan Password WiFi baru Anda (minimal 8 karakter):\n_(Ketik 'batal' untuk membatalkan)_`);
    } else if (state === 'REG_WIFI_FORM_PWD') {
        if (lower === 'batal') {
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            const mRegText = await getMenuReg(customerName, rawFrom, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, formData.hasBills);
            await sendFn(accountId, rawFrom, `❌ Penggantian WiFi dibatalkan.\n\n${mRegText}`);
            return;
        }

        const newPwd = text;
        if (newPwd.length < 8) {
            await sendFn(accountId, rawFrom, `❌ Password WiFi minimal harus 8 karakter.\n\nSilakan masukkan kembali password WiFi baru Anda:\n_(Ketik 'batal' untuk membatalkan)_`);
            return;
        }

        await sendFn(accountId, rawFrom, `🔄 Sedang memproses penggantian WiFi di ONT Anda via GenieACS. Mohon tunggu sebentar...`);

        try {
            await updateCustomerWifi(customerId, newSsid, newPwd);
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            await sendFn(accountId, rawFrom, `✅ *Konfirmasi:* Nama SSID & Password WiFi Anda berhasil diubah!\n\nSSID baru: *${newSsid}*\nPassword baru: *${newPwd}*\n\nRouter Anda sedang memproses perubahan ini. Silakan hubungkan kembali perangkat Anda ke WiFi baru tersebut.\n\nKetik *menu* untuk kembali.`);
        } catch (err) {
            logger.error('[Chatbot] Failed to update WiFi ONT via GenieACS:', err.message);
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            await sendFn(accountId, rawFrom, `❌ *Gagal mengubah WiFi:* ${err.message || 'Koneksi ke GenieACS bermasalah'}.\n\n*Catatan:* Fitur ini masih tahap *BETA*. Jika terjadi kegagalan, silakan buat laporan kendala dengan mengetik *2* di menu utama agar dapat dibantu oleh teknisi kami secara manual.\n\nKetik *menu* untuk kembali.`);
        }
    }
};

module.exports = { handleRegistrationForm, handleSupportForm, handleWifiForm };
