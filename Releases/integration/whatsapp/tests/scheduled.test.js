/**
 * tests/scheduled.test.js
 * Test untuk fitur Scheduled Messages
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
jest.mock('../src/utils/database', () => ({
    ...(() => {
        const scheduled = new Map();
        return {
            saveMessage: jest.fn(),
            getMessages: jest.fn().mockReturnValue([]),
            getMessageById: jest.fn().mockReturnValue(null),
            getDb: jest.fn(),
            saveScheduledMessage: jest.fn((entry) => {
                const now = new Date().toISOString();
                const saved = {
                    ...entry,
                    createdAt: entry.createdAt || now,
                    updatedAt: now,
                    lastSentAt: entry.lastSentAt || null,
                };
                scheduled.set(entry.id, saved);
                return saved;
            }),
            updateScheduledMessage: jest.fn((id, changes) => {
                const current = scheduled.get(id);
                if (!current) return null;
                const next = { ...current, ...changes, updatedAt: new Date().toISOString() };
                scheduled.set(id, next);
                return next;
            }),
            listScheduledMessages: jest.fn(() => Array.from(scheduled.values())),
            listActiveScheduledMessages: jest.fn(() => Array.from(scheduled.values()).filter((entry) => ['active', 'pending', 'failed'].includes(entry.status))),
        };
    })(),
}));

const app = require('../src/app');
const { buildSchedule, createScheduledMessage, getAllScheduledMessages, cancelScheduledMessage } = require('../src/services/scheduledMessages.service');
const API_KEY = process.env.API_KEY;

describe('⏰ ScheduledMessages Service — Unit Tests', () => {
    it('harus melempar error jika scheduledAt di masa lalu untuk tipe once', () => {
        expect(() => {
            createScheduledMessage('default', '6281234', 'Test', { type: 'once', scheduledAt: '2020-01-01T00:00:00' });
        }).toThrow();
    });

    it('harus berhasil membuat jadwal pesan di masa depan (once)', () => {
        const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 jam ke depan
        const result = createScheduledMessage('default', '6281234567890', 'Test terjadwal', { type: 'once', scheduledAt: futureDate });
        expect(result).toHaveProperty('id');
        expect(result.status).toBe('pending');
        expect(result.type).toBe('once');
        // Cleanup
        cancelScheduledMessage(result.id);
    });

    it('harus berhasil membuat jadwal bulanan (monthly)', () => {
        const result = createScheduledMessage('default', '6281234567890', 'Test bulanan', { type: 'monthly', day: '7', time: '12:00' });
        expect(result).toHaveProperty('id');
        expect(result.status).toBe('active');
        expect(result.type).toBe('monthly');
        // Cleanup
        cancelScheduledMessage(result.id);
    });

    it('harus menolak jadwal bulanan di tanggal tidak aman', () => {
        expect(() => {
            buildSchedule({ type: 'monthly', day: '31', time: '08:00' });
        }).toThrow('1-28');
    });

    it('harus menolak jam bulanan invalid', () => {
        expect(() => {
            buildSchedule({ type: 'monthly', day: '7', time: '99:00' });
        }).toThrow('HH:mm');
    });

    it('cancelScheduledMessage() harus return null jika ID tidak ditemukan', () => {
        expect(cancelScheduledMessage('id-tidak-ada')).toBeNull();
    });
});

describe('⏰ Scheduled API — Integration Tests', () => {
    it('POST /api/v1/scheduled harus berhasil menjadwalkan pesan', async () => {
        const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const res = await request(app)
            .post('/api/v1/scheduled')
            .set('X-API-Key', API_KEY)
            .send({ to: '6281234567890', text: 'Reminder test', scheduledAt: futureDate });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data).toHaveProperty('id');
        // Cleanup
        cancelScheduledMessage(res.body.data.id);
    });

    it('POST /api/v1/scheduled harus berhasil menjadwalkan pesan bulanan', async () => {
        const res = await request(app)
            .post('/api/v1/scheduled')
            .set('X-API-Key', API_KEY)
            .send({ to: '6281234567890', text: 'Reminder test', type: 'monthly', day: '7', time: '08:00' });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data.type).toBe('monthly');
        expect(res.body.data.status).toBe('active');
        // Cleanup
        cancelScheduledMessage(res.body.data.id);
    });

    it('POST /api/v1/scheduled harus gagal jika scheduledAt tidak ada untuk once (400)', async () => {
        const res = await request(app)
            .post('/api/v1/scheduled')
            .set('X-API-Key', API_KEY)
            .send({ to: '6281', text: 'No date', type: 'once' });
        expect(res.statusCode).toBe(400);
    });

    it('GET /api/v1/scheduled harus mengembalikan daftar jadwal', async () => {
        const res = await request(app)
            .get('/api/v1/scheduled')
            .set('X-API-Key', API_KEY);
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('DELETE /api/v1/scheduled/:id harus mengembalikan 404 jika ID tidak ada', async () => {
        const res = await request(app)
            .delete('/api/v1/scheduled/nonexistent-id')
            .set('X-API-Key', API_KEY);
        expect(res.statusCode).toBe(404);
    });
});
