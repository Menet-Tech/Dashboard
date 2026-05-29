const logger = require('../utils/logger');
const { UnauthorizedError } = require('../utils/errors');

const apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        logger.warn(`Unauthorized access attempt from ${req.ip}`);
        return next(new UnauthorizedError());
    }
    next();
};

module.exports = { apiKeyAuth };
