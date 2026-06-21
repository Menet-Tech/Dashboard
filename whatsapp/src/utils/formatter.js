const formatPhoneNumber = (to) => {
    if (to.includes('@g.us') || to.includes('@c.us') || to.includes('@lid')) return to;
    // Hapus semua karakter non-digit
    const cleaned = to.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        // Ganti 0 dengan 62 (Indonesia) atau sesuaikan dengan kode negara default
        return `62${cleaned.substring(1)}@c.us`;
    }
    return `${cleaned}@c.us`; // asumsi sudah dengan kode negara
};

module.exports = { formatPhoneNumber };
