const logger = require('../utils/logger');

/**
 * Middleware IP Whitelist.
 * Baca IP_WHITELIST dari .env (comma-separated), tolak jika tidak terdaftar.
 * Jika IP_WHITELIST kosong, semua IP diizinkan.
 */
const ipWhitelist = (req, res, next) => {
    const envList = process.env.IP_WHITELIST || '';
    if (!envList.trim()) return next(); // Tidak ada whitelist = semua izinkan

    const allowed = envList.split(',').map(ip => ip.trim());
    const clientIp = req.ip || req.connection.remoteAddress;

    // Normalisasi IPv6-mapped IPv4
    const normalized = clientIp.replace(/^::ffff:/, '');

    if (allowed.includes(normalized) || allowed.includes(clientIp)) {
        return next();
    }

    logger.warn(`[IPWhitelist] Blocked IP: ${clientIp}`);
    res.status(403).json({ status: 'error', message: 'Access denied: IP not whitelisted' });
};

module.exports = { ipWhitelist };
