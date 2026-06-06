const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
    if (err instanceof AppError) {
        const logPayload = { statusCode: err.statusCode, path: req.originalUrl, requestId: req.requestId };
        if (err.statusCode >= 500) {
            logger.error(`${err.name}: ${err.message}`, { ...logPayload, stack: err.stack });
        } else {
            logger.warn(`${err.name}: ${err.message}`, logPayload);
        }
        return res.status(err.statusCode).json({ status: 'error', message: err.message, requestId: req.requestId });
    }

    // Error tak terduga
    logger.error(`${err.name}: ${err.message}`, { path: req.originalUrl, requestId: req.requestId, stack: err.stack });
    res.status(500).json({ status: 'error', message: 'Internal server error', requestId: req.requestId });
};

module.exports = { errorHandler };
