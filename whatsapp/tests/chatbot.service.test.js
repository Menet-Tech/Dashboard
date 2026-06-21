const mockSessions = new Map();
const mockSaveContactForm = jest.fn();
const mockFindCustomerByPhone = jest.fn();
const mockFindCustomersByPhone = jest.fn();
const mockFindCustomerByID = jest.fn();
const mockGetActiveBill = jest.fn();
const mockGetPackageList = jest.fn();
const mockNotifyAdminViaWA = jest.fn();
const mockNotifyAdminViaDiscord = jest.fn();
const mockCreateTicket = jest.fn();
const mockGetAllTemplates = jest.fn().mockResolvedValue([
    { trigger_key: 'chatbot_trigger_billing', trigger_keywords: '1', is_active: true },
    { trigger_key: 'chatbot_trigger_register', trigger_keywords: '1', is_active: true },
    { trigger_key: 'chatbot_trigger_support', trigger_keywords: '2', is_active: true },
    { trigger_key: 'chatbot_trigger_packages', trigger_keywords: '3', is_active: true },
    { trigger_key: 'chatbot_trigger_faq', trigger_keywords: '4', is_active: true },
    { trigger_key: 'chatbot_trigger_admin', trigger_keywords: '5', is_active: true }
]);

jest.mock('../src/utils/database', () => ({
    getSession: jest.fn((phone) => mockSessions.get(phone) || null),
    upsertSession: jest.fn((phone, accountId, state, formData = {}) => {
        mockSessions.set(phone, { phone, account_id: accountId, state, form_data: formData });
    }),
    deleteSession: jest.fn((phone) => {
        mockSessions.delete(phone);
    }),
    saveContactForm: mockSaveContactForm,
}));

jest.mock('../src/services/isp.service', () => ({
    findCustomerByPhone: mockFindCustomerByPhone,
    findCustomersByPhone: mockFindCustomersByPhone,
    findCustomerByID: mockFindCustomerByID,
    getActiveBill: mockGetActiveBill,
    getPackageList: mockGetPackageList,
    notifyAdminViaWA: mockNotifyAdminViaWA,
    notifyAdminViaDiscord: mockNotifyAdminViaDiscord,
    createTicket: mockCreateTicket,
    getTemplateByTrigger: jest.fn().mockResolvedValue(null),
    getAllTemplates: mockGetAllTemplates,
    getSettings: jest.fn().mockResolvedValue({
        chatbot_trigger_billing: '1',
        chatbot_trigger_register: '1',
        chatbot_trigger_support: '2',
        chatbot_trigger_packages: '3',
        chatbot_trigger_faq: '4',
        chatbot_trigger_admin: '5',
    }),
}));

const database = require('../src/utils/database');
const { handleMessage } = require('../src/services/chatbot.service');

describe('Chatbot ISP state machine', () => {
    const phone = '628123@c.us';
    let sendFn;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSessions.clear();
        sendFn = jest.fn().mockResolvedValue(undefined);
        mockFindCustomersByPhone.mockResolvedValue([]);
        mockFindCustomerByID.mockResolvedValue({ id: 5, name: 'Budi', is_trial: false });
    });

    it('IDLE pelanggan tidak terdaftar masuk menu unregistered', async () => {
        mockFindCustomerByPhone.mockResolvedValue(null);
        mockFindCustomersByPhone.mockResolvedValue([]);

        await handleMessage(phone, 'halo', 'support', sendFn, 'Budi');

        expect(database.upsertSession).toHaveBeenCalledWith(phone, 'support', 'UNREG_MENU', {});
        expect(sendFn).toHaveBeenCalledWith('support', phone, expect.stringContaining('mendaftar'));
    });

    it('IDLE pelanggan terdaftar masuk menu registered', async () => {
        const customer = { id: 5, name: 'Budi', nama: 'Budi' };
        mockFindCustomerByPhone.mockResolvedValue(customer);
        mockFindCustomersByPhone.mockResolvedValue([customer]);

        await handleMessage(phone, 'halo', 'billing', sendFn);

        expect(database.upsertSession).toHaveBeenCalledWith(phone, 'billing', 'REG_MENU', {
            customerId: 5,
            customerName: 'Budi',
            customers: [{ id: 5, name: 'Budi', address: undefined }]
        });
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('Budi'));
    });

    it('menu registered opsi tagihan menampilkan tagihan aktif', async () => {
        mockFindCustomersByPhone.mockResolvedValue([{ id: 5, name: 'Budi', address: 'Jl. Mawar' }]);
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'REG_MENU',
            form_data: { customerId: 5, customerName: 'Budi' },
        });
        mockGetActiveBill.mockResolvedValue({
            periode: '2026-06',
            nominal: 150000,
            jatuh_tempo: '2026-06-30',
            invoice_number: 'INV-1',
        });

        await handleMessage(phone, '1', 'billing', sendFn);

        expect(mockGetActiveBill).toHaveBeenCalledWith(5);
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('nominal sebesar'));
    });

    it('menu unregistered opsi paket menampilkan daftar paket', async () => {
        mockSessions.set(phone, { phone, account_id: 'support', state: 'UNREG_MENU', form_data: {} });
        mockGetPackageList.mockResolvedValue([{ nama: 'Home 10Mbps', kecepatan_mbps: 10, harga: 150000 }]);

        await handleMessage(phone, '3', 'support', sendFn);

        expect(sendFn).toHaveBeenCalledWith('support', phone, expect.stringContaining('Home 10Mbps'));
    });

    it('alur registrasi menyimpan form dan notifikasi admin saat selesai', async () => {
        mockSessions.set(phone, {
            phone,
            account_id: 'support',
            state: 'REG_FORM_7',
            form_data: {
                nama: 'Ani',
                no_hp: '08123',
                alamat: 'Jl. Mawar',
                paket: 'Home 10',
                ssid: 'AniNet',
                password: 'rahasia',
                referral: 'teman',
            },
        });

        await handleMessage(phone, 'tidak', 'support', sendFn);

        expect(mockSaveContactForm).toHaveBeenCalledWith('registration', phone, 'support', expect.objectContaining({
            nama: 'Ani',
            isp_lain: 'tidak',
        }));
        expect(mockNotifyAdminViaWA).toHaveBeenCalled();
        expect(mockNotifyAdminViaDiscord).toHaveBeenCalled();
        expect(sendFn).toHaveBeenCalledWith('support', phone, expect.stringContaining('Terima kasih'));
    });

    it('alur support menyimpan tiket saat selesai', async () => {
        mockSessions.set(phone, {
            phone,
            account_id: 'support',
            state: 'SUPPORT_FORM_2',
            form_data: { nama: 'Ani', alamat: 'Jl. Mawar' },
        });

        await handleMessage(phone, 'wifi lambat', 'support', sendFn);

        expect(mockSaveContactForm).toHaveBeenCalledWith('support', phone, 'support', expect.objectContaining({
            nama: 'Ani',
            kendala: 'wifi lambat',
        }));
        expect(mockCreateTicket).toHaveBeenCalledWith(expect.objectContaining({
            nama: 'Ani',
            no_hp: phone,
            alamat: 'Jl. Mawar',
            kendala: 'wifi lambat',
        }));
        expect(sendFn).toHaveBeenCalledWith('support', phone, expect.stringContaining('Laporan'));
    });

    it('state tidak dikenal di-reset ke IDLE', async () => {
        mockSessions.set(phone, { phone, account_id: 'support', state: 'UNKNOWN', form_data: {} });
        mockFindCustomerByPhone.mockResolvedValue(null);

        await handleMessage(phone, 'apa', 'support', sendFn);

        expect(database.deleteSession).toHaveBeenCalledWith(phone);
        expect(sendFn).toHaveBeenCalledWith('support', phone, expect.stringContaining('mendaftar'));
    });

    it('menggunakan custom trigger dan custom menu template', async () => {
        const { getSettings, getTemplateByTrigger, getAllTemplates } = require('../src/services/isp.service');
        getSettings.mockResolvedValue({
            chatbot_trigger_billing: 'tagihan, billing, cek',
            chatbot_trigger_register: 'daftar',
            chatbot_trigger_support: 'lapor',
            chatbot_trigger_packages: 'paket',
            chatbot_trigger_faq: 'tanya',
            chatbot_trigger_admin: 'halo admin',
        });
        getAllTemplates.mockResolvedValue([
            { trigger_key: 'chatbot_trigger_billing', trigger_keywords: 'tagihan, billing, cek', is_active: true },
            { trigger_key: 'chatbot_trigger_register', trigger_keywords: 'daftar', is_active: true },
            { trigger_key: 'chatbot_trigger_support', trigger_keywords: 'lapor', is_active: true },
            { trigger_key: 'chatbot_trigger_packages', trigger_keywords: 'paket', is_active: true },
            { trigger_key: 'chatbot_trigger_faq', trigger_keywords: 'tanya', is_active: true },
            { trigger_key: 'chatbot_trigger_admin', trigger_keywords: 'halo admin', is_active: true }
        ]);
        getTemplateByTrigger.mockImplementation(async (triggerKey) => {
            if (triggerKey === 'chatbot_menu_reg') {
                return {
                    trigger_key: 'chatbot_menu_reg',
                    isi_template: 'Menu premium: ketik {trigger_billing} untuk tagihan.',
                    is_active: true
                };
            }
            return null;
        });

        mockFindCustomersByPhone.mockResolvedValue([{ id: 5, name: 'Budi', address: 'Jl. Mawar' }]);
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'REG_MENU',
            form_data: { customerId: 5, customerName: 'Budi' },
        });

        mockGetActiveBill.mockResolvedValue({
            periode: '2026-06',
            nominal: 150000,
            jatuh_tempo: '2026-06-30',
            invoice_number: 'INV-1',
        });

        // Test custom trigger match (case-insensitive and trimmed)
        await handleMessage(phone, ' TAGIHAN ', 'billing', sendFn);

        expect(mockGetActiveBill).toHaveBeenCalledWith(5);
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('nominal sebesar'));

        // Test custom template fallback message
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'REG_MENU',
            form_data: { customerId: 5, customerName: 'Budi' },
        });
        await handleMessage(phone, 'salah-input', 'billing', sendFn);
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('Menu premium: ketik tagihan, billing, cek untuk tagihan.'));
    });
});
