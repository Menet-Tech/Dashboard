const formatPhoneNumber = (to) => {
    if (typeof to !== 'string') return to;
    if (to.includes('@g.us') || to.includes('@s.whatsapp.net') || to.includes('@lid')) return to;
    if (to.includes('@c.us')) return to.replace('@c.us', '@s.whatsapp.net');
    
    // Hapus semua karakter non-digit
    const cleaned = to.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        // Ganti 0 dengan 62 (Indonesia) atau sesuaikan dengan kode negara default
        return `62${cleaned.substring(1)}@s.whatsapp.net`;
    }
    return `${cleaned}@s.whatsapp.net`; // asumsi sudah dengan kode negara
};

module.exports = { formatPhoneNumber };
