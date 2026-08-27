const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');
const { ipWhitelist } = require('./middleware/ipWhitelist');
const crypto = require('crypto');

const app = express();
const parseCorsOrigins = () => {
    const raw = process.env.CORS_ORIGIN || '';
    if (!raw.trim()) {
        return process.env.NODE_ENV === 'production' ? false : '*';
    }
    return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
};

app.use(helmet());
app.use(cors({ origin: parseCorsOrigins() }));
app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = String(requestId);
    res.setHeader('X-Request-Id', req.requestId);
    next();
});
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || '1mb' }));
app.use(ipWhitelist);  // Feature 3: IP Whitelist
app.use(rateLimiter);

// Static folder untuk file temporary (media)
app.use('/temp/media', express.static(path.join(__dirname, '../temp/media'), {
    maxAge: '1h',
    setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
}));

// Static folder untuk persistent uploads (gambar autoreply)
app.use('/uploads', express.static(path.join(__dirname, '../storage/uploads'), {
    maxAge: '7d',
    setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
}));
app.use('/wa/uploads', express.static(path.join(__dirname, '../storage/uploads'), {
    maxAge: '7d',
    setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
}));

// Cegah akses langsung ke /temp/ selain media
app.use('/temp', (req, res) => {
    res.status(403).send('Forbidden');
});

// Routes
app.use('/api', routes);

// Swagger UI – only loaded when DISABLE_SWAGGER != 'true' (saves ~5-10MB heap in production)
if (process.env.DISABLE_SWAGGER !== 'true') {
    const swaggerUi = require('swagger-ui-express');
    const swaggerSpec = require('./docs/swagger');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

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
