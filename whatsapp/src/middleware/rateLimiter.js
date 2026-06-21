// Rate limiter disabled per user request
const rateLimiter = (req, res, next) => {
    next();
};

module.exports = { rateLimiter };
