/**
 * tests/auth.test.js
 * Test untuk middleware autentikasi API Key
 */
const request = require('supertest');

jest.mock('whatsapp-web.js');
jest.mock('../src/whatsapp/client', () => ({
    isReady: () => true,
    getClient: () => require('whatsapp-web.js').__mocks__ || {},
    initWhatsAppClient: jest.fn(),
    waitForClientReady: jest.fn().mockResolvedValue(),
    scheduleReconnect: jest.fn(),
}));

const app = require('../src/app');

describe('🔐 Auth Middleware — API Key Validation', () => {
    it('harus menolak request tanpa API Key (401)', async () => {
        const res = await request(app).post('/api/v1/messages').send({ to: '6281', text: 'test' });
        expect(res.statusCode).toBe(401);
        expect(res.body.status).toBe('error');
    });

    it('harus menolak request dengan API Key yang salah (401)', async () => {
        const res = await request(app)
            .post('/api/v1/messages')
            .set('X-API-Key', 'kunci-salah')
            .send({ to: '6281', text: 'test' });
        expect(res.statusCode).toBe(401);
    });

    it('harus mengizinkan request dengan API Key yang benar (bukan 401)', async () => {
        const res = await request(app)
            .get('/api/v1/status')
            .set('X-API-Key', process.env.API_KEY);
        expect(res.statusCode).not.toBe(401);
    });
});

describe('🏥 Health Check', () => {
    it('GET /health harus mengembalikan status ok tanpa API Key', async () => {
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('ok');
    });
});
