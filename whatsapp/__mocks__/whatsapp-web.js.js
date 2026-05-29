/**
 * Mock untuk whatsapp-web.js
 * Digunakan di semua test yang membutuhkan koneksi WhatsApp.
 */
const mockSendMessage = jest.fn().mockResolvedValue({
    id: { id: 'mock-msg-id', _serialized: 'mock-serialized-id' }
});

const mockOn = jest.fn();
const mockInitialize = jest.fn().mockResolvedValue(undefined);
const mockGetContacts = jest.fn().mockResolvedValue([
    { id: { _serialized: '6281234567890@c.us' }, name: 'Test User', number: '6281234567890' }
]);
const mockGetChats = jest.fn().mockResolvedValue([
    { id: { _serialized: 'group1@g.us' }, name: 'Test Group', isGroup: true }
]);
const mockGetChatById = jest.fn().mockResolvedValue({
    id: { _serialized: 'group1@g.us' }, name: 'Test Group', isGroup: true
});
const mockGetContactById = jest.fn().mockResolvedValue({
    id: { _serialized: '6281234567890@c.us' }, name: 'Test User'
});
const mockGetProfilePicUrl = jest.fn().mockResolvedValue('https://example.com/pic.jpg');
const mockIsRegisteredUser = jest.fn().mockResolvedValue(true);
const mockCreateGroup = jest.fn().mockResolvedValue({ gid: { _serialized: 'newgroup@g.us' } });
const mockDestroy = jest.fn().mockResolvedValue(undefined);
const mockInfo = {
    pushname: 'Test Account',
    wid: { _serialized: '6281234567890@c.us' }
};

module.exports = {
    Client: jest.fn().mockImplementation(() => ({
        on: mockOn,
        initialize: mockInitialize,
        sendMessage: mockSendMessage,
        getContacts: mockGetContacts,
        getChats: mockGetChats,
        getChatById: mockGetChatById,
        getContactById: mockGetContactById,
        getProfilePicUrl: mockGetProfilePicUrl,
        isRegisteredUser: mockIsRegisteredUser,
        createGroup: mockCreateGroup,
        destroy: mockDestroy,
        info: mockInfo,
    })),
    LocalAuth: jest.fn().mockImplementation(() => ({})),
    MessageMedia: {
        fromFilePath: jest.fn().mockReturnValue({ mimetype: 'image/jpeg', data: 'base64data' }),
        fromUrl: jest.fn().mockResolvedValue({ mimetype: 'image/jpeg', data: 'base64data' }),
    },
    // Expose mocks agar bisa di-spy di test
    __mocks__: { mockSendMessage, mockGetContacts, mockGetChats },
};
