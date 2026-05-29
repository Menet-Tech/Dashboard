const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');
const { ipWhitelist } = require('./middleware/ipWhitelist');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(ipWhitelist);  // Feature 3: IP Whitelist
app.use(rateLimiter);

// Static folder untuk file temporary (media)
app.use('/temp/media', express.static(path.join(__dirname, '../temp/media'), {
    maxAge: '1h'
}));

// Cegah akses langsung ke /temp/ selain media
app.use('/temp', (req, res) => {
    res.status(403).send('Forbidden');
});

// Routes
app.use('/api', routes);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check (tanpa middleware readiness)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Dashboard UI Opsional
if (process.env.ENABLE_DASHBOARD === 'true') {
    app.use('/dashboard', express.static(path.join(__dirname, '../frontend/dist')));
    app.get(/^\/dashboard/, (req, res, next) => {
        // Jangan intercept request JS/CSS/assets lainnya
        if (req.path.includes('.')) return next();
        res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    });
}

app.use(errorHandler);

module.exports = app;
