const logger = require('../utils/logger');
const { UnauthorizedError } = require('../utils/errors');

const apiKeyAuth = (req, res, next) => {
    // Jika API_KEY tidak dikonfigurasi di environment, izinkan semua akses (local/dev mode)
    if (!process.env.API_KEY || process.env.API_KEY.trim() === '') {
        return next();
    }
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        logger.warn(`Unauthorized access attempt from ${req.ip}. Expected: "${process.env.API_KEY}", Got: "${apiKey}"`);
        return next(new UnauthorizedError());
    }
    next();
};

module.exports = { apiKeyAuth };
