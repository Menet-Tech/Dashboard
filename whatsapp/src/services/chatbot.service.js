/**
 * chatbot.service.js
 * State machine chatbot ISP Menet Dashboard.
 * 
 * State list:
 *   IDLE                  – Salam awal, cek nomor terdaftar atau tidak
 *   UNREG_MENU            – Menu utama untuk nomor belum terdaftar
 *   REG_MENU              – Menu utama untuk pelanggan terdaftar
 *   REG_FORM_{STEP}       – Multi-step form pendaftaran (1-9)
 *   SUPPORT_FORM_{STEP}   – Multi-step form kendala/tiket (1-3)
 *   WAITING_ADMIN         – User sudah diteruskan ke admin
 */

const logger = require('../utils/logger');
const { getSession, upsertSession, deleteSession, saveContactForm } = require('../utils/database');
const { findCustomerByPhone, findCustomersByPhone, findCustomerByID, getActiveBill, getPackageList, notifyAdminViaWA, notifyAdminViaDiscord, createTicket, getTemplateByTrigger, getAllTemplates, getSettings, getReferredCount, withdrawReferral, convertReferralToVoucher, getActiveTicket, replyToTicket, updateCustomerWifi, claimVoucher, toggleAutoApplyVoucher, getCustomerVouchers } = require('./isp.service');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Stripping @c.us dan normalize ke 62xxx */
const normalizePhone = (rawFrom) => rawFrom.replace(/@(c\.us|lid)$/, '').replace(/^0/, '62');

/** Greeting berdasarkan jam WIB */
const greeting = () => {
    const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getHours();
    if (hour < 11) return 'pagi';
    if (hour < 15) return 'siang';
    if (hour < 19) return 'sore';
    return 'malam';
};

/** Format nominal rupiah */
const formatRp = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

/** Format tanggal Indonesia */
const formatDate = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

/** Render simple template with placeholders */
const renderTemplate = (templateStr, variables) => {
    let result = templateStr;
    for (const key in variables) {
        result = result.split(`{${key}}`).join(variables[key] !== undefined ? variables[key] : '');
    }
    return result;
};

// ─── Menu Teks ───────────────────────────────────────────────────────────────

const defaultMenuUnreg = (triggerRegister, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin) => 
`hai, selamat datang di menet dashboard, silahkan ikuti panduan tersebut:
kirim ${triggerRegister} untuk mendaftar, dan menggunakan internet menet
kirim ${triggerSupport} jika ada kendala mengenai wifi
kirim ${triggerPackages} untuk melihat paket yang disediakan
kirim ${triggerFAQ} untuk melihat pertanyaan umum
kirim ${triggerAdmin} untuk chat ke admin`;

const defaultMenuReg = (nama, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin) => 
`hai, selamat ${greeting()} ${nama}, apa ada yang bisa di bantu ?
ketik ${triggerBilling} untuk cek tagihan anda
ketik ${triggerSupport} jika ada kendala mengenai wifi
kirim ${triggerPackages} untuk melihat paket yang disediakan
kirim ${triggerFAQ} untuk melihat pertanyaan umum
kirim 6 atau referral untuk cek & klaim reward referal
kirim ${triggerAdmin} untuk chat ke admin`;

const getMenuUnreg = async (triggerRegister, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin) => {
    const tpl = await getTemplateByTrigger('chatbot_menu_unreg');
    if (tpl) {
        return renderTemplate(tpl.content || tpl.isi_template, {
            trigger_register: triggerRegister,
            trigger_support: triggerSupport,
            trigger_packages: triggerPackages,
            trigger_faq: triggerFAQ,
            trigger_admin: triggerAdmin
        });
    }
    return defaultMenuUnreg(triggerRegister, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
};

const getMenuReg = async (nama, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin) => {
    const tpl = await getTemplateByTrigger('chatbot_menu_reg');
    let baseText = "";
    if (tpl) {
        baseText = renderTemplate(tpl.content || tpl.isi_template, {
            greeting: greeting(),
            nama,
            trigger_billing: triggerBilling,
            trigger_support: triggerSupport,
            trigger_packages: triggerPackages,
            trigger_faq: triggerFAQ,
            trigger_admin: triggerAdmin
        });
    } else {
        baseText = defaultMenuReg(nama, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
    }

    if (!baseText.toLowerCase().includes('referral') && !baseText.toLowerCase().includes('reward') && !baseText.toLowerCase().includes('klaim')) {
        baseText += `\nkirim 6 atau referral untuk cek & klaim reward referal`;
    }
    if (!baseText.toLowerCase().includes('ssid') && !baseText.toLowerCase().includes('password') && !baseText.toLowerCase().includes('wifi') && !baseText.includes('7')) {
        baseText += `\nkirim 7 atau wifi untuk ganti nama/password wifi`;
    }
    return baseText;
};

const FAQ_TEXT = `halo, ini adalah pertanyaan yang paling umum di tanyakan,

> Kapan wifi dipasang setelah daftar?
> Pemasangan dilakukan setiap hari Sabtu & Minggu.

> Bagaimana cara bayar tagihan?
> Tagihan bisa dibayar via transfer bank atau e-wallet sesuai info yang dikirim admin.

> Wifi saya lambat, kenapa?
> Coba restart router dulu. Jika masih lambat, kirim laporan lewat menu 2.

> Bisakah saya ganti paket?
> Bisa! Hubungi admin lewat menu 5 untuk info lebih lanjut.`;

// ─── Alur Registrasi ─────────────────────────────────────────────────────────

const REG_STEPS = [
    { key: 'nama',       prompt: 'silahkan lengkapi form ini\nnama : ' },
    { key: 'no_hp',      prompt: 'no hp : ' },
    { key: 'alamat',     prompt: 'alamat : ' },
    { key: 'paket',      prompt: 'paket yang diambil\nnama wifi (ssid) : ' }, // Combines nicely with prompt structure
    { key: 'ssid',       prompt: 'nama wifi (ssid) : ' },
    { key: 'password',   prompt: 'password wifi : ' },
    { key: 'referral',   prompt: 'mengetahui kami dari siapa atau berikan kode referal : ' },
    { key: 'isp_lain',   prompt: 'apakah saat ini masih langganan ke wifi (ISP) lain : ' },
];

// ─── Alur Support/Kendala ────────────────────────────────────────────────────

const SUPPORT_STEPS = [
    { key: 'nama',    prompt: 'halo, kami mohon maaf jika, kamu memiliki masalah, silahkan lengkapi masalah tersebut, akan kami sampaikan ke teknisi kami\nNama : ' },
    { key: 'alamat',  prompt: 'Alamat : ' },
    { key: 'kendala', prompt: 'Kendala : ' },
];

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * Handle pesan masuk dari satu nomor.
 * @param {string} rawFrom       — "6281xxx@c.us"
 * @param {string} body          — isi pesan
 * @param {string} accountId     — akun WA yang menerima
 * @param {Function} sendFn      — async (accountId, to, text) => void
 * @param {string} contactName   — nama kontak dari WhatsApp (opsional)
 */
const handleMessage = async (rawFrom, body, accountId, sendFn, contactName = '') => {
    const phone = normalizePhone(rawFrom);
    const text  = (body || '').trim();
    const lower = text.toLowerCase();

    // User ketik "menu" atau "0" kapan saja → kembali ke awal
    if (lower === 'menu' || lower === '0') {
        deleteSession(rawFrom);
        return handleMessage(rawFrom, '', accountId, sendFn, contactName);
    }

    const session = getSession(rawFrom);
    const state   = session?.state ?? 'IDLE';
    const formData= session?.form_data ?? {};

    logger.debug(`[Chatbot] ${phone} state=${state} msg="${text}"`);

    // Fetch dynamic chatbot templates & triggers from DB
    const allTemplates = await getAllTemplates();

    const findTriggerKeywords = (key, defaultVal) => {
        const found = allTemplates.find(t => t.trigger_key === key && t.is_active);
        return found ? (found.trigger_keywords || defaultVal) : defaultVal;
    };

    const triggerBilling = findTriggerKeywords('chatbot_trigger_billing', '1');
    const triggerRegister = findTriggerKeywords('chatbot_trigger_register', '1');
    const triggerSupport = findTriggerKeywords('chatbot_trigger_support', '2');
    const triggerPackages = findTriggerKeywords('chatbot_trigger_packages', '3');
    const triggerFAQ = findTriggerKeywords('chatbot_trigger_faq', '4');
    const triggerAdmin = findTriggerKeywords('chatbot_trigger_admin', '5');

    const matchTrigger = (inputStr, triggerStr) => {
        if (!triggerStr) return false;
        return triggerStr.split(',').map(x => x.trim().toLowerCase()).includes(inputStr.trim().toLowerCase());
    };

    const checkCustomTriggers = async () => {
        const systemTriggers = [
            'chatbot_trigger_billing',
            'chatbot_trigger_register',
            'chatbot_trigger_support',
            'chatbot_trigger_packages',
            'chatbot_trigger_faq',
            'chatbot_trigger_admin',
            'chatbot_menu_unreg',
            'chatbot_menu_reg',
            'chatbot_trial',
            'chatbot_no_bill',
            'chatbot_due_bill',
            'chatbot_active_bill',
            'alert_teknisi'
        ];
        const customChatbotTemplates = allTemplates.filter(t => 
            t.is_active && 
            t.trigger_key.startsWith('chatbot_') && 
            !systemTriggers.includes(t.trigger_key) &&
            t.trigger_keywords &&
            t.trigger_keywords.trim() !== ''
        );

        for (const tpl of customChatbotTemplates) {
            if (matchTrigger(text, tpl.trigger_keywords)) {
                const customer = await findCustomerByPhone(rawFrom);
                const replyText = renderTemplate(tpl.content || tpl.isi_template || '', {
                    nama: customer ? customer.name : (contactName || 'Pelanggan'),
                    alamat: customer ? customer.alamat : '',
                    no_hp: rawFrom.replace(/@c\.us$/, ''),
                });
                await sendFn(accountId, rawFrom, replyText);
                return true;
            }
        }
        return false;
    };

    // ── IDLE: cek apakah terdaftar ──────────────────────────────────────────
    if (state === 'IDLE') {
        const customersList = await findCustomersByPhone(rawFrom);
        if (customersList && customersList.length > 0) {
            const customer = customersList[0];
            upsertSession(rawFrom, accountId, 'REG_MENU', { 
                customerId: customer.id, 
                customerName: customer.name,
                customers: customersList.map(c => ({ id: c.id, name: c.name, address: c.address || c.alamat }))
            });
            const mRegText = await getMenuReg(customer.name, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
            await sendFn(accountId, rawFrom, mRegText);
        } else {
            upsertSession(rawFrom, accountId, 'UNREG_MENU', {});
            const mUnregText = await getMenuUnreg(triggerRegister, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
            await sendFn(accountId, rawFrom, mUnregText);
        }
        return;
    }

    // ── UNREG_MENU ──────────────────────────────────────────────────────────
    if (state === 'UNREG_MENU') {
        if (matchTrigger(text, triggerRegister)) {
            upsertSession(rawFrom, accountId, 'REG_FORM_0', {});
            await sendFn(accountId, rawFrom, REG_STEPS[0].prompt);
        } else if (matchTrigger(text, triggerSupport)) {
            upsertSession(rawFrom, accountId, 'SUPPORT_FORM_0', {});
            await sendFn(accountId, rawFrom, SUPPORT_STEPS[0].prompt);
        } else if (matchTrigger(text, triggerPackages)) {
            await sendPackageList(accountId, rawFrom, sendFn);
        } else if (matchTrigger(text, triggerFAQ)) {
            await sendFn(accountId, rawFrom, FAQ_TEXT);
        } else if (matchTrigger(text, triggerAdmin)) {
            await requestAdmin(rawFrom, accountId, contactName, sendFn);
        } else {
            const matchedCustom = await checkCustomTriggers();
            if (!matchedCustom) {
                const mUnregText = await getMenuUnreg(triggerRegister, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
                await sendFn(accountId, rawFrom, `Hm, aku kurang ngerti 😅\n\n${mUnregText}`);
            }
        }
        return;
    }

    // ── REG_MENU ────────────────────────────────────────────────────────────
    if (state === 'REG_MENU') {
        const { customerId, customerName, customers } = formData;
        if (matchTrigger(text, triggerBilling)) {
            let customersList = customers;
            if (!customersList) {
                const list = await findCustomersByPhone(rawFrom);
                customersList = list.map(c => ({ id: c.id, name: c.name, address: c.address || c.alamat }));
            }
            if (customersList && customersList.length > 1) {
                upsertSession(rawFrom, accountId, 'REG_SELECT_BILL_CUSTOMER', { 
                    ...formData, 
                    customers: customersList 
                });
                let optionsMsg = `Halo, kami menemukan ${customersList.length} akun terdaftar dengan nomor ini. Silakan pilih akun yang ingin dicek tagihannya:\n\n`;
                customersList.forEach((c, idx) => {
                    optionsMsg += `${idx + 1}. ${c.name} - ${c.address}\n`;
                });
                optionsMsg += `\nSilakan ketik angka pilihan Anda (1-${customersList.length}):\n_(Ketik *menu* atau *0* untuk kembali menu utama)_`;
                await sendFn(accountId, rawFrom, optionsMsg);
            } else {
                await sendBillInfo(customerId, customerName, accountId, rawFrom, sendFn);
            }
        } else if (matchTrigger(text, triggerSupport)) {
            upsertSession(rawFrom, accountId, 'SUPPORT_FORM_0', { ...formData });
            await sendFn(accountId, rawFrom, `Halo ${customerName}, ${SUPPORT_STEPS[0].prompt.replace(/^🔧.*\n\n/, '')}`);
        } else if (matchTrigger(text, triggerPackages)) {
            await sendPackageList(accountId, rawFrom, sendFn);
        } else if (matchTrigger(text, triggerFAQ)) {
            await sendFn(accountId, rawFrom, FAQ_TEXT);
        } else if (matchTrigger(text, triggerAdmin)) {
            await requestAdmin(rawFrom, accountId, contactName || customerName, sendFn);
        } else if (matchTrigger(text, '6') || matchTrigger(text, 'referral') || matchTrigger(text, 'reward') || matchTrigger(text, 'mgm')) {
            upsertSession(rawFrom, accountId, 'REG_REFERRAL_MENU', { ...formData });
            await sendReferralMenu(customerId, customerName, accountId, rawFrom, sendFn);
        } else if (matchTrigger(text, '7') || matchTrigger(text, 'wifi') || matchTrigger(text, 'ganti wifi')) {
            const customer = await findCustomerByID(customerId);
            if (!customer || !customer.sn_ont || customer.sn_ont.trim() === "") {
                await sendFn(accountId, rawFrom, "❌ Maaf, Serial Number ONT Anda belum dikonfigurasi di dashboard oleh admin. Fitur ubah WiFi mandiri tidak tersedia sementara.");
                return;
            }
            upsertSession(rawFrom, accountId, 'REG_WIFI_FORM_SSID', { ...formData, snOnt: customer.sn_ont });
            await sendFn(accountId, rawFrom, "SSID dan Password apa yang ingin Anda gunakan?\n\nSilakan masukkan Nama WiFi (SSID) baru Anda:\n_(Ketik 'batal' untuk membatalkan)_");
        } else {
            const matchedCustom = await checkCustomTriggers();
            if (!matchedCustom) {
                const mRegText = await getMenuReg(customerName, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
                await sendFn(accountId, rawFrom, `Hm, aku kurang ngerti 😅\n\n${mRegText}`);
            }
        }
        return;
    }
 
    // ── REG_SELECT_BILL_CUSTOMER ───────────────────────────────────────────
    if (state === 'REG_SELECT_BILL_CUSTOMER') {
        const { customers } = formData;
        if (!customers || customers.length === 0) {
            deleteSession(rawFrom);
            return handleMessage(rawFrom, '', accountId, sendFn, contactName);
        }

        const selectedIndex = parseInt(text, 10) - 1;
        if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < customers.length) {
            const selectedCustomer = customers[selectedIndex];
            upsertSession(rawFrom, accountId, 'REG_MENU', { 
                ...formData, 
                customerId: selectedCustomer.id, 
                customerName: selectedCustomer.name 
            });
            await sendBillInfo(selectedCustomer.id, selectedCustomer.name, accountId, rawFrom, sendFn);
        } else {
            let optionsMsg = `Pilihan tidak valid. Silakan pilih nomor 1 sampai ${customers.length}:\n\n`;
            customers.forEach((c, idx) => {
                optionsMsg += `${idx + 1}. ${c.name} - ${c.address}\n`;
            });
            optionsMsg += `\nSilakan ketik angka pilihan Anda (1-${customers.length}):\n_(Ketik *menu* atau *0* untuk kembali ke menu utama)_`;
            await sendFn(accountId, rawFrom, optionsMsg);
        }
        return;
    }

    // ── REG_REFERRAL_MENU ───────────────────────────────────────────────────
    if (state === 'REG_REFERRAL_MENU') {
        const { customerId, customerName } = formData;
        const customer = await findCustomerByID(customerId);
        if (!customer) {
            deleteSession(rawFrom);
            return handleMessage(rawFrom, '', accountId, sendFn, contactName);
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

            try {
                await withdrawReferral(customer.id, amount);
                
                // Notif Admin via WA & Discord
                const cleanPhone = rawFrom.replace(/@c\.us$/, '').replace(/^\+/, '');
                const linkNumber = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.replace(/^0/, '');
                const alertMsg = `💸 *Permintaan Penarikan Tunai Referral*\nNama Pelanggan: ${customerName}\nNo HP: wa.me/+${linkNumber}\nNominal Pencairan: ${formatRp(amount)}\n\nMohon segera diproses transfernya ke pelanggan terkait.`;
                
                await notifyAdminViaWA({ phone: rawFrom, contactName: customerName, accountId }, sendFn, alertMsg);
                await notifyAdminViaDiscord({ phone: rawFrom, contactName: customerName }, alertMsg);

                await sendFn(accountId, rawFrom, `✅ *Penarikan Tunai Berhasil Diajukan!*\n\nPermintaan penarikan saldo sebesar *${formatRp(amount)}* telah kami catat.\nAdmin akan mentransfer dana tersebut ke bank/e-wallet Anda secepatnya.\n\nKetik *menu* untuk kembali.`);
                upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            } catch (err) {
                await sendFn(accountId, rawFrom, `❌ Gagal memproses penarikan: ${err.message}`);
            }
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
            // Jika input tidak dikenali, kirim ulang menu referral
            await sendReferralMenu(customerId, customerName, accountId, rawFrom, sendFn);
        }
        return;
    }

    // ── REG_WIFI_FORM_SSID ──────────────────────────────────────────────────
    if (state === 'REG_WIFI_FORM_SSID') {
        if (lower === 'batal') {
            const { customerId, customerName } = formData;
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            const mRegText = await getMenuReg(customerName, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
            await sendFn(accountId, rawFrom, `❌ Penggantian WiFi dibatalkan.\n\n${mRegText}`);
            return;
        }

        const newSsid = text;
        upsertSession(rawFrom, accountId, 'REG_WIFI_FORM_PWD', { ...formData, newSsid });
        await sendFn(accountId, rawFrom, `Nama WiFi (SSID) diset ke: *${newSsid}*\n\nSekarang masukkan Password WiFi baru Anda (minimal 8 karakter):\n_(Ketik 'batal' untuk membatalkan)_`);
        return;
    }

    // ── REG_WIFI_FORM_PWD ───────────────────────────────────────────────────
    if (state === 'REG_WIFI_FORM_PWD') {
        const { customerId, customerName, newSsid } = formData;
        if (lower === 'batal') {
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId, customerName });
            const mRegText = await getMenuReg(customerName, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
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
            await sendFn(accountId, rawFrom, `❌ *Gagal mengubah WiFi:* ${err.message || 'Koneksi ke GenieACS bermasalah'}.\n\nSilakan hubungi admin atau ketik *menu* untuk kembali.`);
        }
        return;
    }

    // ── REG_FORM_N ──────────────────────────────────────────────────────────
    if (state.startsWith('REG_FORM_')) {
        const step = parseInt(state.replace('REG_FORM_', ''), 10);
        const updatedForm = { ...formData, [REG_STEPS[step].key]: text };

        if (step < REG_STEPS.length - 1) {
            // Lanjut ke step berikutnya
            upsertSession(rawFrom, accountId, `REG_FORM_${step + 1}`, updatedForm);
            await sendFn(accountId, rawFrom, REG_STEPS[step + 1].prompt);
        } else {
            // Form selesai — simpan & konfirmasi
            upsertSession(rawFrom, accountId, 'UNREG_MENU', {});
            saveContactForm('registration', rawFrom, accountId, { ...updatedForm, source: 'whatsapp' });

            // Notif admin with detailed registration info
            const cleanPhone = rawFrom.replace(/@c\.us$/, '').replace(/^\+/, '');
            const linkNumber = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.replace(/^0/, '');
            const customMsg = `📝 *Pendaftaran Baru*
Nama: ${updatedForm.nama}
No HP: ${updatedForm.no_hp}
Alamat: ${updatedForm.alamat}
SSID: ${updatedForm.ssid}
Password: ${updatedForm.password}
Sponsor/Referral: ${updatedForm.referral}
ISP Lain: ${updatedForm.isp_lain}
Nomor WA: wa.me/+${linkNumber}`;

            await notifyAdminViaWA({ phone: rawFrom, contactName: updatedForm.nama, accountId }, sendFn, customMsg);
            await notifyAdminViaDiscord({ phone: rawFrom, contactName: updatedForm.nama }, customMsg);

            await sendFn(accountId, rawFrom,
                `✅ *Terima kasih, ${updatedForm.nama}!*\n\nData pendaftaranmu sudah kami terima. Admin kami akan segera menghubungimu.\n\n📌 *Pemasangan dilakukan setiap Sabtu & Minggu.*\n\nKetik *menu* untuk kembali ke menu utama.`
            );
        }
        return;
    }

    // ── SUPPORT_FORM_N ──────────────────────────────────────────────────────
    if (state.startsWith('SUPPORT_FORM_')) {
        const step = parseInt(state.replace('SUPPORT_FORM_', ''), 10);
        const updatedForm = { ...formData, [SUPPORT_STEPS[step].key]: text };

        if (step < SUPPORT_STEPS.length - 1) {
            upsertSession(rawFrom, accountId, `SUPPORT_FORM_${step + 1}`, updatedForm);
            await sendFn(accountId, rawFrom, SUPPORT_STEPS[step + 1].prompt);
        } else {
            // Form selesai
            const isRegistered = !!formData.customerId;
            saveContactForm('support', rawFrom, accountId, updatedForm);

            // POST support ticket to Go backend
            const ticket = await createTicket({
                pelanggan_id: formData.customerId || null,
                nama: updatedForm.nama,
                no_hp: rawFrom,
                alamat: updatedForm.alamat,
                kendala: updatedForm.kendala
            });

            upsertSession(rawFrom, accountId, 'WAITING_ADMIN', { ...formData, activeTicketId: ticket ? ticket.id : null });

            // Notif admin with detailed support info
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

            await sendFn(accountId, rawFrom,
                `✅ *Laporan kendalamu sudah kami terima!*\n\nTeknisi kami akan segera menghubungi dan membantu menyelesaikan masalahmu, ${updatedForm.nama}.\n\nKetik *menu* untuk kembali ke menu utama.`
            );
        }
        return;
    }

    // ── WAITING_ADMIN ────────────────────────────────────────────────────────
    if (state === 'WAITING_ADMIN') {
        const { activeTicketId } = formData;
        if (activeTicketId) {
            try {
                await replyToTicket(activeTicketId, 'customer', text);
                await sendFn(accountId, rawFrom,
                    `💬 *Laporan Terkirim:* "${text}"\nPesan Anda telah diteruskan ke teknisi.\n\n_(Ketik *menu* atau *0* untuk kembali ke menu utama)_`
                );
            } catch (err) {
                logger.error('[Chatbot] Failed to forward message to ticket:', err.message);
                await sendFn(accountId, rawFrom,
                    `Pesanmu sudah kami sampaikan ke admin ya 😊\nAdmin akan segera membalasmu.\n\nKetik *menu* untuk kembali ke menu utama.`
                );
            }
        } else {
            const activeTicket = await getActiveTicket(rawFrom);
            if (activeTicket) {
                try {
                    await replyToTicket(activeTicket.id, 'customer', text);
                    upsertSession(rawFrom, accountId, 'WAITING_ADMIN', { ...formData, activeTicketId: activeTicket.id });
                    await sendFn(accountId, rawFrom,
                        `💬 *Laporan Terkirim:* "${text}"\nPesan Anda telah diteruskan ke teknisi.\n\n_(Ketik *menu* atau *0* untuk kembali ke menu utama)_`
                    );
                } catch (err) {
                    logger.error('[Chatbot] Failed to forward message to active ticket:', err.message);
                    await sendFn(accountId, rawFrom,
                        `Pesanmu sudah kami sampaikan ke admin ya 😊\nAdmin akan segera membalasmu.\n\nKetik *menu* untuk kembali ke menu utama.`
                    );
                }
            } else {
                await sendFn(accountId, rawFrom,
                    `Pesanmu sudah kami sampaikan ke admin ya 😊\nAdmin akan segera membalasmu.\n\nKetik *menu* untuk kembali ke menu utama.`
                );
            }
        }
        return;
    }

    // Fallback: reset ke IDLE
    deleteSession(rawFrom);
    await handleMessage(rawFrom, '', accountId, sendFn, contactName);
};

// ─── Sub-handlers ────────────────────────────────────────────────────────────

/** Kirim info tagihan aktif */
const sendBillInfo = async (customerId, customerName, accountId, to, sendFn) => {
    const customer = await findCustomerByID(customerId);
    if (customer && customer.is_trial) {
        let remainingDays = customer.trial_days || 3;
        if (customer.trial_started_at) {
            const start = new Date(customer.trial_started_at);
            const now = new Date();
            const elapsedMs = now.getTime() - start.getTime();
            const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
            remainingDays = Math.max(0, customer.trial_days - elapsedDays);
        }

        const tpl = await getTemplateByTrigger('chatbot_trial');
        if (tpl) {
            const msg = renderTemplate(tpl.content || tpl.isi_template, { nama: customerName, hari_limit: remainingDays });
            await sendFn(accountId, to, msg);
        } else {
            await sendFn(accountId, to, `halo ${customerName} terimakaish telah mengugunakan menet, kamu sedang ada di dalam masa trial, tidak akan ada tagihan selama ${remainingDays} hari kedepan, terimakasih.`);
        }
        await sendFn(accountId, to, 'Ketik *menu* untuk kembali ke menu utama.');
        return;
    }

    const bill = await getActiveBill(customerId);
    if (!bill) {
        const now = new Date();
        const periode = `${now.toLocaleString('id-ID', { month: 'long' })} ${now.getFullYear()}`;
        const tpl = await getTemplateByTrigger('chatbot_no_bill');
        if (tpl) {
            const msg = renderTemplate(tpl.content || tpl.isi_template, { nama: customerName, periode });
            await sendFn(accountId, to, msg);
        } else {
            await sendFn(accountId, to,
                `halo ${customerName}, kamu gak ada tagihan aktif di periode ${periode}, terimakasih telah menggunakan menet`
            );
        }
    } else {
        const isDue = new Date(bill.jatuh_tempo) < new Date();
        if (isDue) {
            const tpl = await getTemplateByTrigger('chatbot_due_bill');
            if (tpl) {
                const msg = renderTemplate(tpl.content || tpl.isi_template, { nama: customerName });
                await sendFn(accountId, to, msg);
            } else {
                await sendFn(accountId, to,
                    `halo ${customerName}, tagihan kamu sudah jatuh tempo, mohon segera di bayar, agar service tidak terganggu`
                );
            }
        } else {
            const tpl = await getTemplateByTrigger('chatbot_active_bill');
            if (tpl) {
                const msg = renderTemplate(tpl.content || tpl.isi_template, {
                    nama: customerName,
                    periode: bill.periode,
                    nominal: formatRp(bill.nominal),
                    jatuh_tempo: formatDate(bill.jatuh_tempo)
                });
                await sendFn(accountId, to, msg);
            } else {
                await sendFn(accountId, to,
                    `halo ${customerName}, kamu punya tagihan aktif untuk periode ${bill.periode} dengan nominal sebesar ${formatRp(bill.nominal)}, dan akan jatuh tempo pada ${formatDate(bill.jatuh_tempo)}.`
                );
            }
        }
    }
    await sendFn(accountId, to, 'Ketik *menu* untuk kembali ke menu utama.');
};

/** Kirim menu status & pencairan referral */
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

/** Kirim daftar paket */
const sendPackageList = async (accountId, to, sendFn) => {
    const packages = await getPackageList();
    if (!packages.length) {
        await sendFn(accountId, to, 'Maaf, daftar paket belum tersedia. Hubungi admin untuk informasi lebih lanjut.');
        return;
    }
    const list = packages.map(p => `${p.nama || p.name} - ${p.kecepatan_mbps || p.speed_mbps} Mbps - ${formatRp(p.harga || p.price)}`).join('\n');
    await sendFn(accountId, to, `ini paket yang kami punya,\n${list}`);
    await sendFn(accountId, to, 'Ketik *menu* untuk kembali ke menu utama.');
};

/** Teruskan ke admin via WA + Discord */
const requestAdmin = async (rawFrom, accountId, contactName, sendFn) => {
    upsertSession(rawFrom, accountId, 'WAITING_ADMIN', {});
    await sendFn(accountId, rawFrom,
        `baik, tunggu sebentar ya, kami akan menghubungin admin`
    );
    await notifyAdminViaWA({ phone: rawFrom, contactName, accountId }, sendFn);
    await notifyAdminViaDiscord({ phone: rawFrom, contactName });
};

module.exports = { handleMessage };
