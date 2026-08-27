const mockSendMessage = jest.fn().mockResolvedValue({ key: { id: 'msg-id' } });

jest.mock('../src/whatsapp/client', () => ({
    getClient: jest.fn(() => ({ sendMessage: mockSendMessage })),
}));

jest.mock('../src/utils/database', () => ({
    saveMessage: jest.fn(() => 'internal-id'),
}));

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    readFileSync: jest.fn(() => Buffer.from('mock-data')),
    existsSync: jest.fn(() => true)
}));

const database = require('../src/utils/database');
const service = require('../src/services/whatsapp.service');
const fs = require('fs');

describe('WhatsApp service outbound history', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.io = { emit: jest.fn() };
    });

    afterEach(() => {
        delete global.io;
    });

    it('sendTextMessage menyimpan account_id dan emit realtime event', async () => {
        await service.sendTextMessage('default', '628123', 'Halo tes');

        expect(database.saveMessage).toHaveBeenCalledWith(
            '628123',
            'Halo tes',
            'text',
            'msg-id',
            'outbound',
            null,
            'default',
            null
        );
        expect(global.io.emit).toHaveBeenCalledWith('chat_message', expect.objectContaining({
            account_id: 'default',
            to_number: '628123',
            body: 'Halo tes',
            type: 'text',
        }));
    });

    it('sendMediaMessage menyimpan media dan emit realtime event', async () => {
        await service.sendMediaMessage('media-account', '628111', '/tmp/proof.png', 'Bukti');

        expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/proof.png');
        expect(database.saveMessage).toHaveBeenCalledWith(
            '628111',
            'Bukti',
            'media',
            'msg-id',
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
