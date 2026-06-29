const Joi = require('joi');
const { ValidationError } = require('../utils/errors');

const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        return next(new ValidationError(error.details[0].message));
    }
    next();
};

const sendMessageSchema = Joi.object({
    to: Joi.string().required(),
    text: Joi.string().required(),
    quotedMessageId: Joi.string().allow(null).optional()
});

const createGroupSchema = Joi.object({
    title: Joi.string().required(),
    participants: Joi.array().items(Joi.string()).required()
});

// Anda bisa menambahkan schema lain di sini sesuai kebutuhan API.

module.exports = { validate, sendMessageSchema, createGroupSchema };
