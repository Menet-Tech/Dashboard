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
const { findCustomerByPhone, getActiveBill, getPackageList, notifyAdminViaWA, notifyAdminViaDiscord } = require('./isp.service');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Stripping @c.us dan normalize ke 62xxx */
const normalizePhone = (rawFrom) => rawFrom.replace(/@c\.us$/, '').replace(/^0/, '62');

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

// ─── Menu Teks ───────────────────────────────────────────────────────────────

const MENU_UNREG = `hai, selamat datang di menet dashboard, silahkan ikuti panduan tersebut:
kirim 1 untuk mendaftar, dan menggunakan internet menet
kirim 2 jika ada kendala mengenai wifi
kirim 3 untuk melihat paket yang disediakan
kirim 4 untuk melihat pertanyaan umum
kirim 5 untuk chat ke admin`;

const MENU_REG = (nama) => `hai, selamat ${greeting()} ${nama}, apa ada yang bisa di bantu ?
ketik 1 untuk cek tagihan anda
ketik 2 jika ada kendala mengenai wifi
kirim 3 untuk melihat paket yang disediakan
kirim 4 untuk melihat pertanyaan umum
kirim 5 untuk chat ke admin`;

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
    { key: 'referral',   prompt: 'mengetahui kami dari siapa : ' },
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

    // ── IDLE: cek apakah terdaftar ──────────────────────────────────────────
    if (state === 'IDLE') {
        const customer = await findCustomerByPhone(rawFrom);
        if (customer) {
            upsertSession(rawFrom, accountId, 'REG_MENU', { customerId: customer.id, customerName: customer.name });
            await sendFn(accountId, rawFrom, MENU_REG(customer.name));
        } else {
            upsertSession(rawFrom, accountId, 'UNREG_MENU', {});
            await sendFn(accountId, rawFrom, MENU_UNREG);
        }
        return;
    }

    // ── UNREG_MENU ──────────────────────────────────────────────────────────
    if (state === 'UNREG_MENU') {
        switch (text) {
            case '1':
                upsertSession(rawFrom, accountId, 'REG_FORM_0', {});
                await sendFn(accountId, rawFrom, REG_STEPS[0].prompt);
                break;
            case '2':
                upsertSession(rawFrom, accountId, 'SUPPORT_FORM_0', {});
                await sendFn(accountId, rawFrom, SUPPORT_STEPS[0].prompt);
                break;
            case '3':
                await sendPackageList(accountId, rawFrom, sendFn);
                break;
            case '4':
                await sendFn(accountId, rawFrom, FAQ_TEXT);
                break;
            case '5':
                await requestAdmin(rawFrom, accountId, contactName, sendFn);
                break;
            default:
                await sendFn(accountId, rawFrom, `Hm, aku kurang ngerti 😅\n\n${MENU_UNREG}`);
        }
        return;
    }

    // ── REG_MENU ────────────────────────────────────────────────────────────
    if (state === 'REG_MENU') {
        const { customerId, customerName } = formData;
        switch (text) {
            case '1':
                await sendBillInfo(customerId, customerName, accountId, rawFrom, sendFn);
                break;
            case '2':
                upsertSession(rawFrom, accountId, 'SUPPORT_FORM_0', { ...formData });
                await sendFn(accountId, rawFrom, `Halo ${customerName}, ${SUPPORT_STEPS[0].prompt.replace(/^🔧.*\n\n/, '')}`);
                break;
            case '3':
                await sendPackageList(accountId, rawFrom, sendFn);
                break;
            case '4':
                await sendFn(accountId, rawFrom, FAQ_TEXT);
                break;
            case '5':
                await requestAdmin(rawFrom, accountId, contactName || customerName, sendFn);
                break;
            default:
                await sendFn(accountId, rawFrom, `Hm, aku kurang ngerti 😅\n\n${MENU_REG(customerName)}`);
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
            saveContactForm('registration', rawFrom, accountId, updatedForm);

            // Notif admin
            await notifyAdminViaWA({ phone: rawFrom, contactName: updatedForm.nama, accountId }, sendFn);
            await notifyAdminViaDiscord({ phone: rawFrom, contactName: updatedForm.nama });

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
            upsertSession(rawFrom, accountId, isRegistered ? 'REG_MENU' : 'UNREG_MENU', formData);
            saveContactForm('support', rawFrom, accountId, updatedForm);

            await notifyAdminViaWA({ phone: rawFrom, contactName: updatedForm.nama, accountId }, sendFn);
            await notifyAdminViaDiscord({ phone: rawFrom, contactName: updatedForm.nama });

            await sendFn(accountId, rawFrom,
                `✅ *Laporan kendalamu sudah kami terima!*\n\nTeknisi kami akan segera menghubungi dan membantu menyelesaikan masalahmu, ${updatedForm.nama}.\n\nKetik *menu* untuk kembali ke menu utama.`
            );
        }
        return;
    }

    // ── WAITING_ADMIN ────────────────────────────────────────────────────────
    if (state === 'WAITING_ADMIN') {
        await sendFn(accountId, rawFrom,
            `Pesanmu sudah kami sampaikan ke admin ya 😊\nAdmin akan segera membalasmu.\n\nKetik *menu* untuk kembali ke menu utama.`
        );
        return;
    }

    // Fallback: reset ke IDLE
    deleteSession(rawFrom);
    await handleMessage(rawFrom, '', accountId, sendFn, contactName);
};

// ─── Sub-handlers ────────────────────────────────────────────────────────────

/** Kirim info tagihan aktif */
const sendBillInfo = async (customerId, customerName, accountId, to, sendFn) => {
    const customer = await findCustomerByPhone(to);
    if (customer && customer.is_trial) {
        let remainingDays = customer.trial_days || 3;
        if (customer.trial_started_at) {
            const start = new Date(customer.trial_started_at);
            const now = new Date();
            const elapsedMs = now.getTime() - start.getTime();
            const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
            remainingDays = Math.max(0, customer.trial_days - elapsedDays);
        }
        await sendFn(accountId, to, `halo ${customerName} terimakaish telah mengugunakan menet, kamu sedang ada di dalam masa trial, tidak akan ada tagihan selama ${remainingDays} hari kedepan, terimakasih.`);
        await sendFn(accountId, to, 'Ketik *menu* untuk kembali ke menu utama.');
        return;
    }

    const bill = await getActiveBill(customerId);
    if (!bill) {
        const now = new Date();
        const periode = `${now.toLocaleString('id-ID', { month: 'long' })} ${now.getFullYear()}`;
        await sendFn(accountId, to,
            `halo ${customerName}, kamu gak ada tagihan aktif di periode ${periode}, terimakasih telah menggunakan menet`
        );
    } else {
        const isDue = new Date(bill.jatuh_tempo) < new Date();
        if (isDue) {
            await sendFn(accountId, to,
                `halo ${customerName}, tagihan kamu sudah jatuh tempo, mohon segera di bayar, agar service tidak terganggu`
            );
        } else {
            await sendFn(accountId, to,
                `halo ${customerName}, kamu punya tagihan aktif untuk periode ${bill.periode} dengan nominal sebesar ${formatRp(bill.nominal)}, dan akan jatuh tempo pada ${formatDate(bill.jatuh_tempo)}.`
            );
        }
    }
    await sendFn(accountId, to, 'Ketik *menu* untuk kembali ke menu utama.');
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
