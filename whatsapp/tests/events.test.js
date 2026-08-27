const handlers = {};

jest.mock('../src/utils/database', () => ({
    saveMessage: jest.fn(() => 'saved-inbound-id'),
    getGatewaySetting: jest.fn((key, fallback) => fallback),
    getSession: jest.fn(() => ({ state: 'IDLE' })),
}));

jest.mock('../src/services/autoReply.service', () => ({
    findReply: jest.fn(),
    findReplyRule: jest.fn(),
}));

jest.mock('../src/services/whatsapp.service', () => ({
    sendTextMessage: jest.fn(),
    sendMediaMessage: jest.fn(),
    isAutomatedMessage: jest.fn(() => false)
}));

jest.mock('../src/services/chatbot.service', () => ({
    handleMessage: jest.fn(),
}));

jest.mock('../src/services/isp.service', () => ({
    getSettings: jest.fn().mockResolvedValue({ wa_chatbot_enabled: '1' }),
    findCustomersByPhone: jest.fn().mockResolvedValue([]),
    getActiveBill: jest.fn().mockResolvedValue(null),
    getPendingConfirmation: jest.fn().mockResolvedValue(null),
    uploadProofBase64: jest.fn(),
    createPaymentConfirmation: jest.fn(),
    notifyAdminViaDiscord: jest.fn()
}));

const database = require('../src/utils/database');
const autoReply = require('../src/services/autoReply.service');
const whatsappService = require('../src/services/whatsapp.service');
const chatbotService = require('../src/services/chatbot.service');
const { setupEvents } = require('../src/whatsapp/events');

describe('WhatsApp inbound events', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.keys(handlers).forEach((key) => delete handlers[key]);
        global.io = { emit: jest.fn() };
    });

    afterEach(() => {
        delete global.io;
    });

    function setupClient() {
        const client = {
            ev: {
                on: jest.fn((event, cb) => {
                    handlers[event] = cb;
                }),
            }
        };
        setupEvents(client, 'billing');
        return client;
    }

    const createMockMessage = (from, text, hasMedia = false, fromMe = false) => ({
        messages: [{
            key: { remoteJid: from, id: 'wa-id', fromMe },
            messageTimestamp: Date.now() / 1000 + 10,
            pushName: 'Budi',
            message: hasMedia ? { imageMessage: { caption: text } } : { conversation: text }
        }],
        type: 'notify'
    });

    it('mengabaikan pesan grup dan broadcast', async () => {
        setupClient();
        await handlers['messages.upsert'](createMockMessage('123@g.us', 'halo'));
        await handlers['messages.upsert'](createMockMessage('status@broadcast', 'halo'));

        expect(database.saveMessage).not.toHaveBeenCalled();
        expect(chatbotService.handleMessage).not.toHaveBeenCalled();
    });

    it('menyimpan inbound message dan emit realtime event', async () => {
        setupClient();
        autoReply.findReply.mockReturnValue(null);

        await handlers['messages.upsert'](createMockMessage('628123@s.whatsapp.net', 'cek tagihan'));

        expect(database.saveMessage).toHaveBeenCalledWith(
            'me',
            'cek tagihan',
            'text',
            'wa-id',
            'inbound',
            '628123@s.whatsapp.net',
            'billing'
        );
        expect(global.io.emit).toHaveBeenCalledWith('chat_message', expect.objectContaining({
            id: 'saved-inbound-id',
            account_id: 'billing',
            direction: 'inbound',
        }));
        expect(chatbotService.handleMessage).toHaveBeenCalled();
    });

    it('auto-reply menghentikan alur sebelum chatbot jika cocok', async () => {
        setupClient();
        autoReply.findReplyRule.mockReturnValue({ reply: 'Ini balasan otomatis' });

        await handlers['messages.upsert'](createMockMessage('628123@s.whatsapp.net', 'rekening'));

        expect(whatsappService.sendTextMessage).toHaveBeenCalledWith('billing', '628123@s.whatsapp.net', 'Ini balasan otomatis');
        expect(chatbotService.handleMessage).not.toHaveBeenCalled();
    });

    it('tidak memproses chatbot jika chatbot_enabled nonaktif', async () => {
        setupClient();
        autoReply.findReplyRule.mockReturnValue(null);
        database.getGatewaySetting.mockImplementation((key) => {
            if (key === 'chatbot_enabled') return '0';
            return '*';
        });

        await handlers['messages.upsert'](createMockMessage('628123@s.whatsapp.net', 'halo'));

        expect(chatbotService.handleMessage).not.toHaveBeenCalled();
    });

    it('auto-reply mengirim media jika rule memiliki image_path', async () => {
        setupClient();
        autoReply.findReplyRule.mockReturnValue({ reply: 'Ini balasan gambar', image_path: 'test-image.png' });

        await handlers['messages.upsert'](createMockMessage('628123@s.whatsapp.net', 'qr'));

        expect(whatsappService.sendMediaMessage).toHaveBeenCalledWith(
            'billing',
            '628123@s.whatsapp.net',
            expect.stringContaining('test-image.png'),
            'Ini balasan gambar'
        );
        expect(chatbotService.handleMessage).not.toHaveBeenCalled();
    });
});
