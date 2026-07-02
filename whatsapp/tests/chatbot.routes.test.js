/**
 * tests/chatbot.routes.test.js
 * Test untuk router chatbot & contact forms API
 */
const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('whatsapp-web.js');
jest.mock('../src/whatsapp/client', () => ({
    isReady: () => true,
    getClient: jest.fn(),
    initWhatsAppClient: jest.fn(),
    waitForClientReady: jest.fn().mockResolvedValue(),
    scheduleReconnect: jest.fn(),
}));

jest.mock('../src/services/whatsapp.service', () => ({
    sendTextMessage: jest.fn().mockResolvedValue({ id: { id: 'msg-id' } }),
}));

jest.mock('../src/services/isp.service', () => ({
    findCustomersByPhone: jest.fn().mockResolvedValue([]),
    getAllTemplates: jest.fn().mockResolvedValue([]),
    getTemplateByTrigger: jest.fn().mockResolvedValue(null),
}));

let app;
let tempDir;
let database;
const API_KEY = process.env.API_KEY;

describe('🤖 Chatbot API Routes — Integration Tests', () => {
    beforeAll(() => {
        // Buat temporary directory untuk testing database
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-db-routes-test-'));
        process.env.WA_DB_PATH = path.join(tempDir, 'gateway.sqlite');
        
        // Reset modul agar database baru dengan WA_DB_PATH digunakan
        jest.resetModules();
        database = require('../src/utils/database');
        app = require('../src/app');
    });

    afterAll(() => {
        try {
            database.getDb().close();
        } catch (_) {}
        fs.rmSync(tempDir, { recursive: true, force: true });
        delete process.env.WA_DB_PATH;
    });

    describe('GET & DELETE /api/v1/chatbot/sessions', () => {
        it('GET /sessions harus mengembalikan list sessions kosong', async () => {
            const res = await request(app)
                .get('/api/v1/chatbot/sessions')
                .set('X-API-Key', API_KEY);
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data).toEqual([]);
        });

        it('DELETE /sessions/:phone harus sukses menghapus session', async () => {
            // Setup session dummy
            database.upsertSession('628999@c.us', 'support', 'REG_FORM_1', { name: 'Ani' });
            
            const res = await request(app)
                .delete('/api/v1/chatbot/sessions/628999%40c.us')
                .set('X-API-Key', API_KEY);
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.message).toContain('dires');

            // Cek di DB
            expect(database.getSession('628999@c.us')).toBeNull();
        });
    });

    describe('Forms API (GET, POST, PATCH, DELETE /api/v1/chatbot/forms)', () => {
        let testFormId;

        it('POST /forms harus berhasil menyimpan form baru', async () => {
            const payload = {
                type: 'registration',
                phone: '62812345678',
                data: {
                    nama: 'Budi Test',
                    alamat: 'Kecamatan A',
                    source: 'manual'
                }
            };
            const res = await request(app)
                .post('/api/v1/chatbot/forms')
                .set('X-API-Key', API_KEY)
                .send(payload);
            expect(res.statusCode).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data).toHaveProperty('id');
            testFormId = res.body.data.id;
        });

        it('POST /forms harus return 400 jika parameters wajib hilang', async () => {
            const res = await request(app)
                .post('/api/v1/chatbot/forms')
                .set('X-API-Key', API_KEY)
                .send({ type: 'registration' }); // missing phone
            expect(res.statusCode).toBe(400);
        });

        it('GET /forms harus mengembalikan list form yang terdaftar', async () => {
            const res = await request(app)
                .get('/api/v1/chatbot/forms?type=registration')
                .set('X-API-Key', API_KEY);
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.length).toBeGreaterThanOrEqual(1);
            
            const savedForm = res.body.data.find(f => f.id === testFormId);
            expect(savedForm).toBeDefined();
            expect(savedForm.phone).toBe('62812345678');
            expect(savedForm.data.nama).toBe('Budi Test');
            expect(savedForm.data.source).toBe('manual');
        });

        it('PATCH /forms/:id harus berhasil mengupdate status', async () => {
            const res = await request(app)
                .patch(`/api/v1/chatbot/forms/${testFormId}`)
                .set('X-API-Key', API_KEY)
                .send({ status: 'resolved' });
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.status).toBe('resolved');
        });

        it('DELETE /forms/:id harus menghapus form data', async () => {
            const res = await request(app)
                .delete(`/api/v1/chatbot/forms/${testFormId}`)
                .set('X-API-Key', API_KEY);
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('success');

            // Verifikasi sudah terhapus
            const list = database.getForms('registration');
            expect(list.find(f => f.id === testFormId)).toBeUndefined();
        });
    });

    describe('Chatbot Settings API (GET, PUT /api/v1/chatbot/settings)', () => {
        it('GET /settings harus mengembalikan settings', async () => {
            const res = await request(app)
                .get('/api/v1/chatbot/settings')
                .set('X-API-Key', API_KEY);
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data).toHaveProperty('chatbot_account_id');
            expect(res.body.data).toHaveProperty('chatbot_enabled');
        });

        it('PUT /settings harus mengubah setting tertentu', async () => {
            const res = await request(app)
                .put('/api/v1/chatbot/settings')
                .set('X-API-Key', API_KEY)
                .send({ chatbot_account_id: 'test-account-id', chatbot_enabled: '0' });
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.chatbot_account_id).toBe('test-account-id');
            expect(res.body.data.chatbot_enabled).toBe('0');
            expect(database.getGatewaySetting('chatbot_account_id')).toBe('test-account-id');
            expect(database.getGatewaySetting('chatbot_enabled')).toBe('0');
        });
    });

    describe('POST /api/v1/chatbot/sessions/:phone/resolve', () => {
        it('POST /sessions/:phone/resolve harus menghapus session dan mengirim menu utama', async () => {
            database.upsertSession('628555@c.us', 'default', 'WAITING_ADMIN', { activeTicketId: 10 });
            
            const res = await request(app)
                .post('/api/v1/chatbot/sessions/628555%40c.us/resolve')
                .set('X-API-Key', API_KEY)
                .send({ accountId: 'default' });

            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('success');
            
            // Cek di DB bahwa state direset ke UNREG_MENU
            const session = database.getSession('628555@c.us');
            expect(session).not.toBeNull();
            expect(session.state).toBe('UNREG_MENU');
        });
    });
});
