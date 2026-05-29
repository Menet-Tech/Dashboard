/**
 * tests/ipWhitelist.test.js
 * Test untuk middleware IP Whitelist
 */
const request = require('supertest');

jest.mock('whatsapp-web.js');
jest.mock('../src/whatsapp/client', () => ({
    isReady: () => true,
    getClient: jest.fn(),
    initWhatsAppClient: jest.fn(),
    waitForClientReady: jest.fn().mockResolvedValue(),
    scheduleReconnect: jest.fn(),
}));

describe('🛡️ IP Whitelist Middleware', () => {
    const originalWhitelist = process.env.IP_WHITELIST;

    afterEach(() => {
        process.env.IP_WHITELIST = originalWhitelist;
        jest.resetModules();
    });

    it('harus mengizinkan semua IP jika IP_WHITELIST kosong', async () => {
        process.env.IP_WHITELIST = '';
        jest.resetModules();

        const app = require('../src/app');
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
    });

    it('harus memblokir IP yang tidak ada di whitelist (403)', async () => {
        process.env.IP_WHITELIST = '10.0.0.1'; // IP yang tidak mungkin match localhost
        jest.resetModules();

        const app = require('../src/app');
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(403);
    });

    it('harus mengizinkan IP yang ada di whitelist', async () => {
        process.env.IP_WHITELIST = '127.0.0.1,::1,::ffff:127.0.0.1';
        jest.resetModules();

        const app = require('../src/app');
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
    });
});
