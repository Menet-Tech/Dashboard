const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
    logger.error(`${err.name}: ${err.message}`, { stack: err.stack });

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ status: 'error', message: err.message });
    }

    // Error tak terduga
    res.status(500).json({ status: 'error', message: 'Internal server error' });
};

module.exports = { errorHandler };
