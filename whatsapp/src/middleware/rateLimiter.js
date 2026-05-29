const rateLimit = require('express-rate-limit');

const keyGenerator = (req) => req.headers['x-api-key'] || req.ip;

const apiKeyLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    keyGenerator,
    validate: false,
    message: { status: 'error', message: 'Too many requests for this API key' },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { rateLimiter: apiKeyLimiter };
