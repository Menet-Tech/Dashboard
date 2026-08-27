/**
 * tests/messages.test.js
 * Test untuk endpoint kirim pesan dan validasinya
 */
const request = require('supertest');

jest.mock('@whiskeysockets/baileys');
jest.mock('../src/whatsapp/client', () => ({
    isReady: () => true,
    getClient: () => ({
        sendMessage: jest.fn().mockResolvedValue({
            id: { id: 'msg-123', _serialized: 'mock-serialized-id' }
        }),
    }),
    initWhatsAppClient: jest.fn(),
    waitForClientReady: jest.fn().mockResolvedValue(),
    scheduleReconnect: jest.fn(),
}));

// Mock database agar tidak perlu file SQLite saat test
jest.mock('../src/utils/database', () => ({
    saveMessage: jest.fn().mockReturnValue('saved-id'),
    getMessages: jest.fn().mockReturnValue([]),
    getMessageById: jest.fn().mockReturnValue(null),
    getDb: jest.fn().mockReturnValue(null), // return null signals DB unavailable in controller
}));


const app = require('../src/app');
const API_KEY = process.env.API_KEY;

describe('💬 Messages — POST /api/v1/messages', () => {
    it('harus menolak jika field "to" tidak ada (400)', async () => {
        const res = await request(app)
            .post('/api/v1/messages')
            .set('X-API-Key', API_KEY)
            .send({ text: 'Hello' });
        expect(res.statusCode).toBe(400);
        expect(res.body.status).toBe('error');
    });

    it('harus menolak jika field "text" tidak ada (400)', async () => {
        const res = await request(app)
            .post('/api/v1/messages')
            .set('X-API-Key', API_KEY)
            .send({ to: '6281234567890' });
        expect(res.statusCode).toBe(400);
        expect(res.body.status).toBe('error');
    });

    it('harus berhasil mengirim pesan dengan payload yang valid (200)', async () => {
        const res = await request(app)
            .post('/api/v1/messages')
            .set('X-API-Key', API_KEY)
            .send({ to: '6281234567890', text: 'Halo dunia!' });
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body).toHaveProperty('id');
    });
});

describe('📜 Message History — GET /api/v1/messages/history', () => {
    it('harus mengembalikan array history pesan', async () => {
        const res = await request(app)
            .get('/api/v1/messages/history')
            .set('X-API-Key', API_KEY);
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('success');
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});
