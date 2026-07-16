const { upsertSession, deleteSession } = require('../../../utils/database');
const { getMenuUnreg, getMenuReg, checkHasUnpaidBills } = require('../menus');
const { getTemplate, getTriggers } = require('../templates');
const { findCustomerByPhone, findCustomersByPhone, getPackageList, getActiveBill, getPendingConfirmation } = require('../../isp.service');
const { matchTrigger, renderTemplate, formatRp } = require('../utils');
const { sendBillInfo } = require('./billingHandler');
const { sendPackageList } = require('./commonHandler');
const { requestAdmin } = require('./adminHandler');
const { sendReferralMenu } = require('./referralHandler');
const logger = require('../../../utils/logger');

const checkCustomTriggers = async (ctx) => {
    const { text, rawFrom, contactName, accountId, sendFn, triggers } = ctx;
    const { allTemplates } = triggers;

    const systemTriggers = [
        'chatbot_trigger_billing', 'chatbot_trigger_register', 'chatbot_trigger_support',
        'chatbot_trigger_packages', 'chatbot_trigger_faq', 'chatbot_trigger_admin',
        'chatbot_menu_unreg', 'chatbot_menu_reg', 'chatbot_menu_reg_has_bills', 'chatbot_menu_reg_no_bills',
        'chatbot_trial', 'chatbot_no_bill', 'chatbot_due_bill', 'chatbot_active_bill', 'alert_teknisi',
        'chatbot_error_unknown', 'chatbot_faq'
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
                alamat: customer ? (customer.alamat || customer.address) : '',
                no_hp: rawFrom.replace(/@c\.us$/, ''),
            });
            await sendFn(accountId, rawFrom, replyText);
            return true;
        }
    }
    return false;
};

const handleMenuState = async (ctx) => {
    const { rawFrom, text, accountId, sendFn, contactName, state, formData, triggers } = ctx;
    const { triggerRegister, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, triggerBilling } = triggers;

    if (state === 'IDLE') {
        const customersList = await findCustomersByPhone(rawFrom);
        if (customersList && customersList.length > 0) {
            const customer = customersList[0];
            const hasBills = await checkHasUnpaidBills(rawFrom);
            upsertSession(rawFrom, accountId, 'REG_MENU', { 
                customerId: customer.id, 
                customerName: customer.name,
                hasBills: hasBills,
                customers: customersList.map(c => ({ id: c.id, name: c.name, address: c.address || c.alamat }))
            });
            const mRegText = await getMenuReg(customer.name, rawFrom, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, hasBills);
            await sendFn(accountId, rawFrom, mRegText);
        } else {
            upsertSession(rawFrom, accountId, 'UNREG_MENU', {});
            const mUnregText = await getMenuUnreg(triggerRegister, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
            await sendFn(accountId, rawFrom, mUnregText);
        }
        return;
    }

    if (state === 'UNREG_MENU') {
        if (matchTrigger(text, triggerRegister)) {
            upsertSession(rawFrom, accountId, 'REG_FORM_0', {});
            await sendFn(accountId, rawFrom, "silahkan lengkapi form ini\nnama : ");
        } else if (matchTrigger(text, triggerSupport)) {
            upsertSession(rawFrom, accountId, 'SUPPORT_FORM_0', {});
            await sendFn(accountId, rawFrom, "halo, kami mohon maaf jika, kamu memiliki masalah, silahkan lengkapi masalah tersebut, akan kami sampaikan ke teknisi kami\nNama : ");
        } else if (matchTrigger(text, triggerPackages)) {
            await sendPackageList(accountId, rawFrom, sendFn);
        } else if (matchTrigger(text, triggerFAQ)) {
            const faqText = await getTemplate('chatbot_faq', {}, 'Berikut pertanyaan yang sering diajukan...\n\nKetik *menu* untuk kembali.');
            await sendFn(accountId, rawFrom, faqText);
        } else if (matchTrigger(text, triggerAdmin)) {
            await requestAdmin(rawFrom, accountId, contactName, sendFn);
        } else {
            const matchedCustom = await checkCustomTriggers(ctx);
            if (!matchedCustom) {
                const mUnregText = await getMenuUnreg(triggerRegister, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin);
                const errorText = await getTemplate('chatbot_error_unknown', { menu_text: mUnregText }, 'Hm, aku kurang ngerti 😅\n\n{menu_text}');
                await sendFn(accountId, rawFrom, errorText);
            }
        }
        return;
    }

    if (state === 'REG_MENU') {
        const { customerId, customerName } = formData;
        let hasBills = formData.hasBills;
        if (hasBills === undefined) {
            hasBills = await checkHasUnpaidBills(rawFrom);
            upsertSession(rawFrom, accountId, 'REG_MENU', { ...formData, hasBills });
        }

        let optionCekTagihan = matchTrigger(text, triggerBilling) || matchTrigger(text, '1') || matchTrigger(text, 'cek tagihan');
        let optionKonfirmasi = false;
        let optionSupport = false;
        let optionPackages = false;
        let optionFAQ = false;
        let optionAdmin = false;
        let optionReferral = matchTrigger(text, 'referral') || matchTrigger(text, 'reward') || matchTrigger(text, 'mgm');
        let optionWifi = matchTrigger(text, 'wifi') || matchTrigger(text, 'ganti wifi') || matchTrigger(text, 'ganti password');

        if (hasBills) {
            optionKonfirmasi = matchTrigger(text, '2') || matchTrigger(text, 'bayar') || matchTrigger(text, 'konfirmasi') || matchTrigger(text, 'konfirmasi pembayaran');
            optionSupport = matchTrigger(text, '3') || matchTrigger(text, triggerSupport);
            optionPackages = matchTrigger(text, '4') || matchTrigger(text, triggerPackages);
            optionFAQ = matchTrigger(text, '5') || matchTrigger(text, triggerFAQ);
            optionAdmin = matchTrigger(text, '6') || matchTrigger(text, triggerAdmin);
            optionReferral = optionReferral || matchTrigger(text, '7');
            optionWifi = optionWifi || matchTrigger(text, '8');
        } else {
            optionSupport = matchTrigger(text, '2') || matchTrigger(text, triggerSupport);
            optionPackages = matchTrigger(text, '3') || matchTrigger(text, triggerPackages);
            optionFAQ = matchTrigger(text, '4') || matchTrigger(text, triggerFAQ);
            optionAdmin = matchTrigger(text, '5') || matchTrigger(text, triggerAdmin);
            optionReferral = optionReferral || matchTrigger(text, '6');
            optionWifi = optionWifi || matchTrigger(text, '7');
        }

        if (optionCekTagihan) {
            await sendBillInfo(customerId, customerName, accountId, rawFrom, sendFn);
        } else if (optionSupport) {
            upsertSession(rawFrom, accountId, 'SUPPORT_FORM_0', { ...formData });
            await sendFn(accountId, rawFrom, `Halo ${customerName}, silakan lengkapi masalah tersebut, akan kami sampaikan ke teknisi kami\nNama : `);
        } else if (optionPackages) {
            await sendPackageList(accountId, rawFrom, sendFn);
        } else if (optionFAQ) {
            const faqText = await getTemplate('chatbot_faq', {}, 'Berikut pertanyaan yang sering diajukan...\n\nKetik *menu* untuk kembali.');
            await sendFn(accountId, rawFrom, faqText);
        } else if (optionAdmin) {
            await requestAdmin(rawFrom, accountId, contactName || customerName, sendFn);
        } else if (optionReferral) {
            upsertSession(rawFrom, accountId, 'REG_REFERRAL_MENU', { ...formData });
            await sendReferralMenu(customerId, customerName, accountId, rawFrom, sendFn);
        } else if (optionWifi) {
            const customer = await findCustomerByPhone(rawFrom); // Get details to check SN
            if (!customer || !customer.sn_ont || customer.sn_ont.trim() === "") {
                await sendFn(accountId, rawFrom, "❌ Maaf, Serial Number ONT Anda belum dikonfigurasi di dashboard oleh admin. Fitur ubah WiFi mandiri tidak tersedia sementara.");
                return;
            }
            upsertSession(rawFrom, accountId, 'REG_WIFI_FORM_SSID', { ...formData, snOnt: customer.sn_ont });
            await sendFn(accountId, rawFrom, "SSID dan Password apa yang ingin Anda gunakan?\n\n*Catatan:* Fitur ganti WiFi mandiri ini masih dalam tahap *BETA*. Jika terjadi kegagalan atau kendala, silakan laporkan via menu utama (ketik untuk kendala wifi).\n\nSilakan masukkan Nama WiFi (SSID) baru Anda:\n_(Ketik 'batal' untuk membatalkan)_");
        } else if (optionKonfirmasi) {
            const customersList = await findCustomersByPhone(rawFrom);
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
                upsertSession(rawFrom, accountId, 'WAITING_PAYMENT_METHOD', {
                    ...formData,
                    unpaidBills: unpaidBills.map(item => ({ billId: item.bill.id, customerId: item.customer.id }))
                });
                await sendFn(accountId, rawFrom, "Bayar pake apa ?\n1. Transfer\n2. Cash\n\nSilakan balas dengan angka 1 atau 2:\n_(Ketik 'batal' untuk membatalkan)_");
            } else {
                await sendFn(accountId, rawFrom, "Anda tidak memiliki tagihan aktif yang perlu dikonfirmasi saat ini.");
            }
        } else if (matchTrigger(text, 'oke') || matchTrigger(text, 'siap') || matchTrigger(text, 'baik') || matchTrigger(text, 'setuju') || matchTrigger(text, 'ok') || matchTrigger(text, 'oke siap')) {
            const customersList = await findCustomersByPhone(rawFrom);
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
                upsertSession(rawFrom, accountId, 'WAITING_PROOF', {
                    ...formData,
                    unpaidBills: unpaidBills.map(item => ({ billId: item.bill.id, customerId: item.customer.id }))
                });
                await sendFn(accountId, rawFrom, `baik bapak/ibu ${customerName}, akan kami tunggu pembayaraanya. jika kamu menggunakan metode transfer, silahkan langsung kirimkan bukti screenshoot ke sini. terimakasih`);
            } else {
                await sendFn(accountId, rawFrom, "Anda tidak memiliki tagihan aktif yang perlu dikonfirmasi saat ini.");
            }
        } else if (matchTrigger(text, 'sudah') || matchTrigger(text, 'sudah bayar') || matchTrigger(text, 'ya saya sudah bayar') || matchTrigger(text, 'ya')) {
            const customersList = await findCustomersByPhone(rawFrom);
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
                upsertSession(rawFrom, accountId, 'WAITING_PROOF', {
                    ...formData,
                    unpaidBills: unpaidBills.map(item => ({ billId: item.bill.id, customerId: item.customer.id }))
                });
                await sendFn(accountId, rawFrom, "Jangan lupa kirimkan bukti transfer ya! Atau jika Anda membayar dengan cash, silakan balas dengan *\"ya saya sudah bayar\"*.\n\n_(Ketik 'batal' untuk membatalkan)_");
            }
        } else {
            const matchedCustom = await checkCustomTriggers(ctx);
            if (!matchedCustom) {
                const mRegText = await getMenuReg(customerName, rawFrom, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, hasBills);
                const errorText = await getTemplate('chatbot_error_unknown', { menu_text: mRegText }, 'Hm, aku kurang ngerti 😅\n\n{menu_text}');
                await sendFn(accountId, rawFrom, errorText);
            }
        }
    }
};

const handleSelectBillCustomer = async (ctx) => {
    const { rawFrom, text, accountId, sendFn, contactName, formData } = ctx;
    const { customers } = formData;
    if (!customers || customers.length === 0) {
        deleteSession(rawFrom);
        // Can't easily recurse cleanly here without cyclic deps, just reset state
        await sendFn(accountId, rawFrom, "Sesi habis, silakan ketik *menu* kembali.");
        return;
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
};

module.exports = {
    handleMenuState,
    handleSelectBillCustomer
};
