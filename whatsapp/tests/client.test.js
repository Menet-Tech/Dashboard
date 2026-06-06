const mockClientInstances = [];
const mockGenerateQr = jest.fn();
const mockSendDiscordNotification = jest.fn();
const mockSetupEvents = jest.fn();
const mockRm = jest.fn().mockResolvedValue(undefined);

jest.mock('fs/promises', () => ({
    rm: mockRm,
}));

jest.mock('qrcode-terminal', () => ({
    generate: mockGenerateQr,
}));

jest.mock('../src/utils/discord', () => ({
    sendDiscordNotification: mockSendDiscordNotification,
}));

jest.mock('../src/whatsapp/events', () => ({
    setupEvents: mockSetupEvents,
}));

jest.mock('whatsapp-web.js', () => ({
    LocalAuth: jest.fn(function LocalAuth(options) {
        this.options = options;
    }),
    Client: jest.fn(function Client() {
        const handlers = {};
        const instance = {
            handlers,
            on: jest.fn((event, cb) => {
                handlers[event] = cb;
            }),
            initialize: jest.fn(),
            destroy: jest.fn().mockResolvedValue(undefined),
        };
        mockClientInstances.push(instance);
        return instance;
    }),
}));

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

    it('initWhatsAppClient membuat client, setup events, dan emit status awal', () => {
        const client = clientModule.initWhatsAppClient('lifecycle');

        expect(client).toBe(mockClientInstances[0]);
        expect(client.initialize).toHaveBeenCalled();
        expect(mockSetupEvents).toHaveBeenCalledWith(client, 'lifecycle');
        expect(global.io.emit).toHaveBeenCalledWith('account_status', {
            accountId: 'lifecycle',
            ready: false,
            hasQr: false,
        });
    });

    it('handler qr/authenticated/ready memperbarui status realtime', () => {
        const client = clientModule.initWhatsAppClient('lifecycle');

        client.handlers.qr('QR-CODE');
        expect(clientModule.getQr('lifecycle')).toBe('QR-CODE');
        expect(mockGenerateQr).toHaveBeenCalledWith('QR-CODE', { small: true });
        expect(global.io.emit).toHaveBeenCalledWith('qr_code', { accountId: 'lifecycle', qr: 'QR-CODE' });

        client.handlers.authenticated();
        expect(clientModule.getQr('lifecycle')).toBeNull();

        client.handlers.ready();
        expect(clientModule.isReady('lifecycle')).toBe(true);
        expect(global.io.emit).toHaveBeenCalledWith('account_status', {
            accountId: 'lifecycle',
            ready: true,
            hasQr: false,
        });
    });

    it('removeAccount menghancurkan client, menghapus session, dan emit account_removed', async () => {
        const client = clientModule.initWhatsAppClient('lifecycle');

        await expect(clientModule.removeAccount('lifecycle')).resolves.toBe(true);

        expect(client.destroy).toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled();
        expect(global.io.emit).toHaveBeenCalledWith('account_removed', { accountId: 'lifecycle' });
        expect(clientModule.getAllAccounts().some((item) => item.accountId === 'lifecycle')).toBe(false);
    });

    it('menolak account id yang tidak aman', () => {
        expect(() => clientModule.initWhatsAppClient('../bad')).toThrow('Account ID');
    });
});
