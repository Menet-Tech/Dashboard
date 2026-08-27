const { getPackageList } = require('../../isp.service');
const { formatRp } = require('../utils');

const sendPackageList = async (accountId, to, sendFn) => {
    const packages = await getPackageList();
    if (!packages.length) {
        await sendFn(accountId, to, 'Maaf, daftar paket belum tersedia. Hubungi admin untuk informasi lebih lanjut.');
        return;
    }
    // Sort from cheapest to most expensive
    packages.sort((a, b) => {
        const priceA = a.harga ?? a.price ?? 0;
        const priceB = b.harga ?? b.price ?? 0;
        return priceA - priceB;
    });
    const list = packages.map(p => `${p.nama || p.name} - ${p.kecepatan_mbps || p.speed_mbps} Mbps - ${formatRp(p.harga || p.price)}`).join('\n');
    await sendFn(accountId, to, `ini paket yang kami punya,\n${list}`);
    await sendFn(accountId, to, 'Ketik *menu* untuk kembali ke menu utama.');
};

module.exports = { sendPackageList };
