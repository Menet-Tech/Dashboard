/**
 * tests/autoreply.test.js
 * Test untuk fitur Auto-Reply Bot Rules
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

const app = require('../src/app');
const { addRule, getAllRules, deleteRule, findReplyRule, findReply } = require('../src/services/autoReply.service');
const API_KEY = process.env.API_KEY;

describe('🤖 AutoReply Service — Unit Tests', () => {
    beforeEach(() => {
        // Bersihkan rules sebelum setiap test
        getAllRules().forEach(r => deleteRule(r.id));
    });

    it('addRule() harus menambah rule baru', () => {
        const rule = addRule('harga', 'Harga Rp 50.000', 'contains');
        expect(rule).toHaveProperty('id');
        expect(rule.keyword).toBe('harga');
        expect(rule.enabled).toBe(true);
    });

    it('addRule() harus menyimpan image_path jika diberikan', () => {
        const rule = addRule('qr', 'Scan QR ini', 'exact', { image_path: 'qr-code.png' });
        expect(rule.imagePath).toBe('qr-code.png');
        expect(rule.image_path).toBe('qr-code.png');
    });

    it('findReplyRule() harus mengembalikan rule lengkap termasuk image_path', () => {
        addRule('qr', 'Scan QR ini', 'exact', { image_path: 'qr-code.png' });
        const matched = findReplyRule('qr');
        expect(matched).not.toBeNull();
        expect(matched.reply).toBe('Scan QR ini');
        expect(matched.imagePath).toBe('qr-code.png');
    });

    it('findReply() harus menemukan rule yang cocok (contains)', () => {
        addRule('harga', 'Harga Rp 50.000', 'contains');
        expect(findReply('berapa harga produk?')).toBe('Harga Rp 50.000');
    });

    it('findReply() harus menemukan rule yang cocok (exact)', () => {
        addRule('halo', 'Hai! Ada yang bisa dibantu?', 'exact');
        expect(findReply('halo')).toBe('Hai! Ada yang bisa dibantu?');
        expect(findReply('halo kamu')).toBeNull(); // tidak exact match
    });

    it('findReply() harus menemukan rule yang cocok (startsWith)', () => {
        addRule('info', 'Hubungi kami di 081234', 'startsWith');
        expect(findReply('info produk')).toBe('Hubungi kami di 081234');
        expect(findReply('minta info')).toBeNull();
    });

    it('findReply() harus menghormati accountId spesifik', () => {
        addRule('tagihan', 'Balasan billing', 'contains', { accountId: 'billing' });
        addRule('tagihan', 'Balasan umum', 'contains', { accountId: 'support' });
        expect(findReply('cek tagihan saya', 'billing')).toBe('Balasan billing');
        expect(findReply('cek tagihan saya', 'support')).toBe('Balasan umum');
        expect(findReply('cek tagihan saya', 'default')).toBeNull();
    });

    it('findReply() harus memprioritaskan rule akun spesifik dibanding rule global', () => {
        addRule('rekening', 'Balasan global', 'contains', { accountId: '*' });
        addRule('rekening', 'Balasan billing', 'contains', { accountId: 'billing' });
        expect(findReply('minta rekening', 'billing')).toBe('Balasan billing');
    });

    it('findReply() mendukung endsWith dan regex', () => {
        addRule('admin$', 'Regex admin', 'regex');
        addRule('rekening', 'Ends rekening', 'endsWith');
        expect(findReply('chat admin')).toBe('Regex admin');
        expect(findReply('info rekening')).toBe('Ends rekening');
    });

    it('findReply() harus return null jika tidak ada rule yang cocok', () => {
        expect(findReply('tidak ada yang cocok')).toBeNull();
    });

    it('findReply() harus mendukung multiple keyword dengan koma', () => {
        addRule('harga, biaya, bayar', 'Harga Rp 50.000', 'contains');
        addRule('lunas, beres', 'Status Lunas', 'exact');
        
        expect(findReply('berapa biaya internet?')).toBe('Harga Rp 50.000');
        expect(findReply('cara bayar gmn?')).toBe('Harga Rp 50.000');
        expect(findReply('lunas')).toBe('Status Lunas');
        expect(findReply('lunas beres')).toBeNull(); // exact match fails for combined text
    });

    it('rule yang disabled tidak boleh ikut matching', () => {
        const rule = addRule('test', 'test reply', 'contains');
        const { toggleRule } = require('../src/services/autoReply.service');
        toggleRule(rule.id, false);
        expect(findReply('ini test')).toBeNull();
    });
});

describe('🤖 AutoReply API — Integration Tests', () => {
    beforeEach(() => {
        const { getAllRules, deleteRule } = require('../src/services/autoReply.service');
        getAllRules().forEach(r => deleteRule(r.id));
    });

    it('POST /api/v1/autoreply harus berhasil menambah rule (200)', async () => {
        const res = await request(app)
            .post('/api/v1/autoreply')
            .set('X-API-Key', API_KEY)
            .send({ accountId: 'billing', keyword: 'stok', reply: 'Stok tersedia!', matchType: 'contains' });
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data.keyword).toBe('stok');
        expect(res.body.data.accountId).toBe('billing');
    });

    it('POST /api/v1/autoreply harus gagal jika keyword kosong (400)', async () => {
        const res = await request(app)
            .post('/api/v1/autoreply')
            .set('X-API-Key', API_KEY)
            .send({ reply: 'Tanpa keyword' });
        expect(res.statusCode).toBe(400);
    });

    it('GET /api/v1/autoreply harus mengembalikan list rules', async () => {
        const res = await request(app)
            .get('/api/v1/autoreply')
            .set('X-API-Key', API_KEY);
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('DELETE /api/v1/autoreply/:id harus menghapus rule', async () => {
        const create = await request(app)
            .post('/api/v1/autoreply')
            .set('X-API-Key', API_KEY)
            .send({ keyword: 'hapus', reply: 'reply hapus' });
        const id = create.body.data.id;

        const del = await request(app)
            .delete(`/api/v1/autoreply/${id}`)
            .set('X-API-Key', API_KEY);
        expect(del.statusCode).toBe(200);
        expect(del.body.status).toBe('success');
    });

    it('PATCH /api/v1/autoreply/:id harus menolak matchType tidak valid', async () => {
        const create = await request(app)
            .post('/api/v1/autoreply')
            .set('X-API-Key', API_KEY)
            .send({ keyword: 'ubah', reply: 'reply ubah' });
        const id = create.body.data.id;

        const res = await request(app)
            .patch(`/api/v1/autoreply/${id}`)
            .set('X-API-Key', API_KEY)
            .send({ matchType: 'invalid' });

        expect(res.statusCode).toBe(400);
    });
});
