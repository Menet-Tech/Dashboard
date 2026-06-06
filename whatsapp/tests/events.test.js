const handlers = {};

jest.mock('../src/utils/database', () => ({
    saveMessage: jest.fn(() => 'saved-inbound-id'),
    getGatewaySetting: jest.fn((key, fallback) => fallback),
}));

jest.mock('../src/services/autoReply.service', () => ({
    findReply: jest.fn(),
}));

jest.mock('../src/services/whatsapp.service', () => ({
    sendTextMessage: jest.fn(),
}));

jest.mock('../src/services/chatbot.service', () => ({
    handleMessage: jest.fn(),
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
            on: jest.fn((event, cb) => {
                handlers[event] = cb;
            }),
        };
        setupEvents(client, 'billing');
        return client;
    }

    it('mengabaikan pesan grup dan broadcast', async () => {
        setupClient();
        await handlers.message({ from: '123@g.us', body: 'halo' });
        await handlers.message({ from: 'status@broadcast', body: 'halo' });

        expect(database.saveMessage).not.toHaveBeenCalled();
        expect(chatbotService.handleMessage).not.toHaveBeenCalled();
    });

    it('menyimpan inbound message dan emit realtime event', async () => {
        setupClient();
        autoReply.findReply.mockReturnValue(null);

        await handlers.message({
            from: '628123@c.us',
            to: 'me',
            body: 'cek tagihan',
            hasMedia: false,
            id: { id: 'wa-id' },
            getContact: jest.fn().mockResolvedValue({ pushname: 'Budi' }),
        });

        expect(database.saveMessage).toHaveBeenCalledWith(
            'me',
            'cek tagihan',
            'text',
            'wa-id',
            'inbound',
            '628123@c.us',
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
        autoReply.findReply.mockReturnValue('Ini balasan otomatis');

        await handlers.message({
            from: '628123@c.us',
            to: 'me',
            body: 'rekening',
            hasMedia: false,
            id: { id: 'wa-id' },
            getContact: jest.fn(),
        });

        expect(whatsappService.sendTextMessage).toHaveBeenCalledWith('billing', '628123@c.us', 'Ini balasan otomatis');
        expect(chatbotService.handleMessage).not.toHaveBeenCalled();
    });
});
