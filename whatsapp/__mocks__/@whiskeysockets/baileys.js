const mockSocket = {
    ev: {
        on: jest.fn(),
        process: jest.fn(),
    },
    sendMessage: jest.fn().mockResolvedValue({ key: { id: 'mock-wa-id' } }),
    logout: jest.fn().mockResolvedValue(true),
    end: jest.fn(),
    requestPairingCode: jest.fn().mockResolvedValue('123456'),
    onWhatsApp: jest.fn().mockResolvedValue([{ exists: true, jid: '123@s.whatsapp.net' }]),
    profilePictureUrl: jest.fn().mockResolvedValue('http://example.com/pic.jpg'),
    groupCreate: jest.fn().mockResolvedValue({ id: 'group-id' }),
    groupMetadata: jest.fn().mockResolvedValue({ id: 'group-id', subject: 'Mock Group' }),
    sendPresenceUpdate: jest.fn(),
};

module.exports = {
    default: jest.fn(() => mockSocket),
    useMultiFileAuthState: jest.fn().mockResolvedValue({
        state: { creds: {}, keys: {} },
        saveCreds: jest.fn(),
    }),
    DisconnectReason: {
        loggedOut: 401,
        restartRequired: 415,
        timedOut: 408,
        connectionClosed: 428,
        connectionLost: 408,
        connectionReplaced: 440,
        badSession: 500,
        multideviceMismatch: 411
    },
    fetchLatestBaileysVersion: jest.fn().mockResolvedValue({
        version: [2, 3000, 10],
        isLatest: true
    }),
    makeCacheableSignalKeyStore: jest.fn(),
    isJidBroadcast: jest.fn(),
    downloadMediaMessage: jest.fn().mockResolvedValue(Buffer.from('mock-media-data')),
    mockSocket // Export for assertions if needed
};
