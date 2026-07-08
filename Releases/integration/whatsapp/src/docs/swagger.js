const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'WhatsApp Gateway API',
            version: '1.0.0',
            description: 'API untuk mengirim dan menerima pesan WhatsApp',
        },
        servers: [
            { url: '/api/v1', description: 'Current Server' },
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                },
            },
        },
        security: [{ ApiKeyAuth: [] }],
    },
    apis: ['./src/routes/v1/*.js'],
};

module.exports = swaggerJsdoc(options);
