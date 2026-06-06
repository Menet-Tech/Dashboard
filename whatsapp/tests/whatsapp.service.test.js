jest.mock('whatsapp-web.js', () => ({
    MessageMedia: {
        fromFilePath: jest.fn(() => ({ mimetype: 'image/png', data: 'mock-data' })),
    },
    Buttons: jest.fn(function Buttons(body, buttons, title, footer) {
        this.body = body;
        this.buttons = buttons;
        this.title = title;
        this.footer = footer;
    }),
    List: jest.fn(function List(body, buttonText, sections, title, footer) {
        this.body = body;
        this.buttonText = buttonText;
        this.sections = sections;
        this.title = title;
        this.footer = footer;
    }),
}));

const mockSendMessage = jest.fn().mockResolvedValue({ id: { id: 'msg-id', _serialized: 'serialized-id' } });

jest.mock('../src/whatsapp/client', () => ({
    getClient: jest.fn(() => ({ sendMessage: mockSendMessage })),
}));

jest.mock('../src/utils/database', () => ({
    saveMessage: jest.fn(() => 'internal-id'),
}));

const database = require('../src/utils/database');
const service = require('../src/services/whatsapp.service');

describe('WhatsApp service outbound history', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.io = { emit: jest.fn() };
    });

    afterEach(() => {
        delete global.io;
    });

    it('sendButtonMessage menyimpan account_id dan emit realtime event', async () => {
        await service.sendButtonMessage('billing', '628123', 'Body tombol', [{ body: 'OK' }], 'Judul', 'Footer');

        expect(database.saveMessage).toHaveBeenCalledWith(
            '628123',
            'Judul',
            'button',
            'serialized-id',
            'outbound',
            null,
            'billing'
        );
        expect(global.io.emit).toHaveBeenCalledWith('chat_message', expect.objectContaining({
            account_id: 'billing',
            to_number: '628123',
            body: 'Judul',
            type: 'button',
        }));
    });

    it('sendListMessage menyimpan account_id dan emit realtime event', async () => {
        await service.sendListMessage('support', '628999', 'Body list', 'Pilih', [{ title: 'Menu', rows: [] }], '', '');

        expect(database.saveMessage).toHaveBeenCalledWith(
            '628999',
            'Body list',
            'list',
            'serialized-id',
            'outbound',
            null,
            'support'
        );
        expect(global.io.emit).toHaveBeenCalledWith('chat_message', expect.objectContaining({
            account_id: 'support',
            to_number: '628999',
            body: 'Body list',
            type: 'list',
        }));
    });

    it('sendMediaMessage menyimpan media dan emit realtime event', async () => {
        await service.sendMediaMessage('media-account', '628111', '/tmp/proof.png', 'Bukti');

        expect(database.saveMessage).toHaveBeenCalledWith(
            '628111',
            'Bukti',
            'media',
            'serialized-id',
            'outbound',
            null,
            'media-account'
        );
        expect(global.io.emit).toHaveBeenCalledWith('chat_message', expect.objectContaining({
            account_id: 'media-account',
            type: 'media',
        }));
    });
});
