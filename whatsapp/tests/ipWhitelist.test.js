/**
 * tests/ipWhitelist.test.js
 * Test untuk middleware IP Whitelist
 */
const request = require('supertest');

jest.mock('@whiskeysockets/baileys');
jest.mock('../src/whatsapp/client', () => ({
    isReady: () => true,
    getClient: jest.fn(),
    initWhatsAppClient: jest.fn(),
    waitForClientReady: jest.fn().mockResolvedValue(),
    scheduleReconnect: jest.fn(),
}));

describe('🛡️ IP Whitelist Middleware', () => {
    const originalWhitelist = process.env.IP_WHITELIST;
    let app;

    beforeAll(() => {
        app = require('../src/app');
    });

    afterEach(() => {
        process.env.IP_WHITELIST = originalWhitelist;
    });

    it('harus mengizinkan semua IP jika IP_WHITELIST kosong', async () => {
        process.env.IP_WHITELIST = '';
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
    });

    it('harus memblokir IP yang tidak ada di whitelist (403)', async () => {
        process.env.IP_WHITELIST = '10.0.0.1';
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(403);
    });

    it('harus mengizinkan IP yang ada di whitelist', async () => {
        process.env.IP_WHITELIST = '127.0.0.1,::1,::ffff:127.0.0.1';
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
    });
});
