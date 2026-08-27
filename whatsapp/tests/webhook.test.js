/**
 * tests/webhook.test.js
 * Test untuk Webhook service dan signature verification
 */
const crypto = require('crypto');
const { handleIncomingMessage, addWebhookUrl, removeWebhookUrl, getAllWebhookUrls } = require('../src/services/webhook.service');
const axios = require('axios');

jest.mock('axios');

describe('🪝 Webhook Service — Unit Tests', () => {
    const testUrl = 'https://example.com/webhook';

    afterEach(() => {
        removeWebhookUrl(testUrl);
        jest.clearAllMocks();
    });

    it('addWebhookUrl() harus menambah URL ke list', () => {
        addWebhookUrl(testUrl);
        expect(getAllWebhookUrls()).toContain(testUrl);
    });

    it('removeWebhookUrl() harus menghapus URL dari list', () => {
        addWebhookUrl(testUrl);
        removeWebhookUrl(testUrl);
        expect(getAllWebhookUrls()).not.toContain(testUrl);
    });

    it('addWebhookUrl() tidak boleh duplikasi URL', () => {
        addWebhookUrl(testUrl);
        addWebhookUrl(testUrl);
        const urls = getAllWebhookUrls().filter(u => u === testUrl);
        expect(urls.length).toBe(1);
    });

    it('handleIncomingMessage() harus mengirim POST ke semua URL webhook', async () => {
        addWebhookUrl(testUrl);
        axios.post.mockResolvedValue({ status: 200 });

        const mockMessage = {
            id: { _serialized: 'test-msg-id' },
            from: '6281234567890@s.whatsapp.net',
            body: 'Halo test',
            type: 'chat',
            timestamp: Date.now(),
            hasMedia: false,
        };

        await handleIncomingMessage(mockMessage);
        expect(axios.post).toHaveBeenCalledWith(
            testUrl,
            expect.objectContaining({ event: 'message' }),
            expect.objectContaining({ headers: expect.any(Object) })
        );
    });

    it('handleIncomingMessage() harus menyertakan X-Webhook-Signature jika WEBHOOK_SECRET diset', async () => {
        addWebhookUrl(testUrl);
        axios.post.mockResolvedValue({ status: 200 });

        const mockMessage = {
            id: { _serialized: 'test-msg-id-2' },
            from: '6281234567890@s.whatsapp.net',
            body: 'Test signature',
            type: 'chat',
            timestamp: Date.now(),
            hasMedia: false,
        };

        await handleIncomingMessage(mockMessage, null);

        const callArgs = axios.post.mock.calls[0];
        const headers = callArgs[2].headers;
        expect(headers).toHaveProperty('X-Webhook-Signature');
        expect(headers['X-Webhook-Signature']).toMatch(/^sha256=/);
    });

    it('X-Webhook-Signature harus valid dan bisa diverifikasi', async () => {
        addWebhookUrl(testUrl);
        axios.post.mockResolvedValue({ status: 200 });

        const mockMessage = {
            id: { _serialized: 'test-verify' },
            from: '6281@s.whatsapp.net',
            body: 'Verify',
            type: 'chat',
            timestamp: 1000,
            hasMedia: false,
        };

        await handleIncomingMessage(mockMessage);

        const callArgs = axios.post.mock.calls[0];
        const payload = callArgs[1];
        const sig = callArgs[2].headers['X-Webhook-Signature'];

        const expected = 'sha256=' + crypto
            .createHmac('sha256', process.env.WEBHOOK_SECRET)
            .update(JSON.stringify(payload))
            .digest('hex');

        expect(sig).toBe(expected);
    });
});
