const mockClientInstances = [];
const mockSendDiscordNotification = jest.fn();
const mockSetupEvents = jest.fn();
const mockRm = jest.fn().mockResolvedValue(undefined);

jest.mock('fs/promises', () => ({
    rm: mockRm,
    mkdir: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../src/utils/discord', () => ({
    sendDiscordNotification: mockSendDiscordNotification,
}));

jest.mock('../src/whatsapp/events', () => ({
    setupEvents: mockSetupEvents,
}));

// We already mock Baileys globally in __mocks__/@whiskeysockets/baileys.js
// But let's intercept the mock instance here
const { default: makeWASocket } = require('@whiskeysockets/baileys');

const clientModule = require('../src/whatsapp/client');

describe('WhatsApp client lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockClientInstances.length = 0;
        global.io = { emit: jest.fn() };
        process.env.ENABLE_DASHBOARD = 'false';
    });

    afterEach(async () => {
        delete global.io;
        try {
            await clientModule.removeAccount('lifecycle');
        } catch (_) {}
        try {
            await clientModule.removeAccount('default');
        } catch (_) {}
    });

    it('initWhatsAppClient membuat client, setup events, dan emit status awal', async () => {
        const client = await clientModule.initWhatsAppClient('lifecycle');
        expect(makeWASocket).toHaveBeenCalled();
        expect(mockSetupEvents).toHaveBeenCalledWith(client, 'lifecycle');
        expect(global.io.emit).toHaveBeenCalledWith('account_status', {
            accountId: 'lifecycle',
            ready: false,
            hasQr: false,
        });
    });

    it('removeAccount menghancurkan client, menghapus session, dan emit account_removed', async () => {
        const client = await clientModule.initWhatsAppClient('lifecycle');

        await expect(clientModule.removeAccount('lifecycle')).resolves.toBe(true);

        expect(client.end).toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled();
        expect(clientModule.getAllAccounts().some((item) => item.accountId === 'lifecycle')).toBe(false);
    });

    it('menolak account id yang tidak aman', async () => {
        await expect(clientModule.initWhatsAppClient('../bad')).rejects.toThrow('Account ID');
    });
});
