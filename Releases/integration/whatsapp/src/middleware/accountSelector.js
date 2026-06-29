/**
 * Middleware untuk mengekstrak X-Account-Id dari headers
 */
const accountSelector = (req, res, next) => {
    // Ambil dari header, jika tidak ada fallback ke 'default'
    const accountId = req.headers['x-account-id'] || 'default';
    
    // Simpan ke object req untuk dipakai di controller/service
    req.accountId = accountId;
    
    next();
};

module.exports = { accountSelector };
