const { getTemplate } = require('./templates');
const { hasUnpaidBills } = require('./utils'); // Wait, hasUnpaidBills needs DB calls, I should put it in a separate helper or here.
const { findCustomersByPhone, getActiveBill, getPendingConfirmation } = require('../isp.service');
const logger = require('../../utils/logger');

const checkHasUnpaidBills = async (phone) => {
    try {
        const customersList = await findCustomersByPhone(phone);
        if (!customersList || customersList.length === 0) return false;
        for (const cust of customersList) {
            if (cust.is_trial) continue;
            const bill = await getActiveBill(cust.id);
            if (bill && bill.status === 'belum_bayar') {
                const pendingConf = await getPendingConfirmation(bill.id);
                if (!pendingConf) {
                    return true;
                }
            }
        }
    } catch (err) {
        logger.error('[Chatbot] failed to check unpaid bills for menu:', err.message);
    }
    return false;
};

const getMenuUnreg = async (triggerRegister, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin) => {
    const fallback = `hai, selamat datang di menet dashboard, silahkan ikuti panduan tersebut:
kirim {trigger_register} untuk mendaftar, dan menggunakan internet menet
kirim {trigger_support} jika ada kendala mengenai wifi
kirim {trigger_packages} untuk melihat paket yang disediakan
kirim {trigger_faq} untuk melihat pertanyaan umum
kirim {trigger_admin} untuk chat ke admin`;

    return getTemplate('chatbot_menu_unreg', {
        trigger_register: triggerRegister,
        trigger_support: triggerSupport,
        trigger_packages: triggerPackages,
        trigger_faq: triggerFAQ,
        trigger_admin: triggerAdmin
    }, fallback);
};

const getMenuReg = async (nama, phone, triggerBilling, triggerSupport, triggerPackages, triggerFAQ, triggerAdmin, hasBills) => {
    const fallback = `hai, selamat {greeting} {nama}, apa ada yang bisa di bantu ?
ketik {trigger_billing} untuk cek tagihan anda
ketik {trigger_support} jika ada kendala mengenai wifi
kirim {trigger_packages} untuk melihat paket yang disediakan
kirim {trigger_faq} untuk melihat pertanyaan umum
kirim {trigger_admin} untuk chat ke admin`;

    // Kita abaikan hasBills untuk template default lama, tapi jika ada template baru yang mendukung hasBills, kita render.
    // Di file lama: ada logic dinamis if (hasBills).
    // Karena kita pindah ke DB, kita serahkan sepenuhnya ke template, atau kita pakai 2 template berbeda:
    // chatbot_menu_reg_has_bills dan chatbot_menu_reg_no_bills
    
    // Tapi untuk backward compatibility dengan kode lama (yang menambahkan opsi dinamis):
    let text = await getTemplate(hasBills ? 'chatbot_menu_reg_has_bills' : 'chatbot_menu_reg_no_bills', {
        nama,
        trigger_billing: triggerBilling,
        trigger_support: triggerSupport,
        trigger_packages: triggerPackages,
        trigger_faq: triggerFAQ,
        trigger_admin: triggerAdmin
    }, null);

    if (!text) {
        // Fallback dinamis lama
        const { greeting } = require('./utils');
        text = `hai, selamat ${greeting()} ${nama}, apa ada yang bisa di bantu ?\n`;
        text += `ketik 1 untuk cek tagihan anda\n`;
        
        if (hasBills) {
            text += `ketik 2 konfirmasi pembayaran\n`;
            text += `ketik 3 jika ada kendala mengenai wifi\n`;
            text += `ketik 4 untuk melihat paket yang disediakan\n`;
            text += `ketik 5 untuk melihat pertanyaan umum\n`;
            text += `ketik 6 untuk chat ke admin\n`;
            text += `ketik 7 untuk cek referral dan clain\n`;
            text += `ketik 8 untuk ganti nama/password wifi (BETA)`;
        } else {
            text += `ketik 2 jika ada kendala mengenai wifi\n`;
            text += `ketik 3 untuk melihat paket yang disediakan\n`;
            text += `ketik 4 untuk melihat pertanyaan umum\n`;
            text += `ketik 5 untuk chat ke admin\n`;
            text += `ketik 6 untuk cek referral dan clain\n`;
            text += `ketik 7 untuk ganti nama/password wifi (BETA)`;
        }
    }

    return text;
};

module.exports = {
    checkHasUnpaidBills,
    getMenuUnreg,
    getMenuReg
};
