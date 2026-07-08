const mockSessions = new Map();
const mockSaveContactForm = jest.fn();
const mockFindCustomerByPhone = jest.fn();
const mockFindCustomersByPhone = jest.fn();
const mockFindCustomerByID = jest.fn();
const mockGetActiveBill = jest.fn();
const mockGetLatestBill = jest.fn();
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
    getLatestBill: mockGetLatestBill,
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
    getPendingConfirmation: jest.fn().mockResolvedValue(null),
    saveChatbotFormToBackend: jest.fn().mockResolvedValue(1),
    uploadProofBase64: jest.fn().mockResolvedValue({ proof_path: '/uploads/payment-proofs/test.png' }),
    createPaymentConfirmation: jest.fn().mockResolvedValue({ id: 1 }),
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
        mockGetLatestBill.mockResolvedValue(null);
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
            hasBills: false,
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
        mockGetLatestBill.mockResolvedValue({
            periode: '2026-06',
            nominal: 150000,
            jatuh_tempo: '2026-06-30',
            invoice_number: 'INV-1',
        });

        await handleMessage(phone, '1', 'billing', sendFn);

        expect(mockGetLatestBill).toHaveBeenCalledWith(5);
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('Nominal:'));
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

        mockGetLatestBill.mockResolvedValue({
            periode: '2026-06',
            nominal: 150000,
            jatuh_tempo: '2026-06-30',
            invoice_number: 'INV-1',
        });

        // Test custom trigger match (case-insensitive and trimmed)
        await handleMessage(phone, ' TAGIHAN ', 'billing', sendFn);

        expect(mockGetLatestBill).toHaveBeenCalledWith(5);
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('Nominal:'));

        // Test custom template fallback message
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'REG_MENU',
            form_data: { customerId: 5, customerName: 'Budi' },
        });
        await handleMessage(phone, 'salah-input', 'billing', sendFn);
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('ketik 1 untuk cek tagihan anda'));
    });

    it('REG_MENU transitions to WAITING_PROOF on "sudah" message with active bill', async () => {
        mockFindCustomersByPhone.mockResolvedValue([{ id: 5, name: 'Budi', address: 'Jl. Mawar' }]);
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'REG_MENU',
            form_data: { customerId: 5, customerName: 'Budi' },
        });
        mockGetActiveBill.mockResolvedValue({
            id: 10,
            status: 'belum_bayar',
            periode: '2026-06',
            nominal: 150000,
            jatuh_tempo: '2026-06-30',
            invoice_number: 'INV-1',
        });

        await handleMessage(phone, 'sudah', 'billing', sendFn);

        expect(database.upsertSession).toHaveBeenCalledWith(phone, 'billing', 'WAITING_PROOF', expect.objectContaining({
            unpaidBills: [{ billId: 10, customerId: 5 }]
        }));
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('bukti transfer'));
    });

    it('REG_MENU handles "oke" reminder acknowledgment and stays in REG_MENU', async () => {
        mockFindCustomersByPhone.mockResolvedValue([{ id: 5, name: 'Budi', address: 'Jl. Mawar' }]);
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'REG_MENU',
            form_data: { customerId: 5, customerName: 'Budi' },
        });
        mockGetActiveBill.mockResolvedValue({
            id: 10,
            status: 'belum_bayar',
            periode: '2026-06',
            nominal: 150000,
            jatuh_tempo: '2026-06-30',
        });

        await handleMessage(phone, 'oke', 'billing', sendFn);

        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('akan kami tunggu pembayaraanya'));
    });

    it('WAITING_PROOF processes "ya saya sudah bayar" text input successfully', async () => {
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'WAITING_PROOF',
            form_data: {
                customerId: 5,
                customerName: 'Budi',
                unpaidBills: [{ billId: 10, customerId: 5 }]
            },
        });

        const { createPaymentConfirmation } = require('../src/services/isp.service');

        await handleMessage(phone, 'ya saya sudah bayar', 'billing', sendFn);

        expect(createPaymentConfirmation).toHaveBeenCalledWith(10, 5, null, 'ya saya sudah bayar', '');
        expect(database.upsertSession).toHaveBeenCalledWith(phone, 'billing', 'REG_MENU', expect.any(Object));
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('proses pengecekan'));
    });

    it('WAITING_PROOF processes image media attachment successfully', async () => {
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'WAITING_PROOF',
            form_data: {
                customerId: 5,
                customerName: 'Budi',
                unpaidBills: [{ billId: 10, customerId: 5 }]
            },
        });

        const rawMsg = {
            hasMedia: true,
            type: 'image',
            downloadMedia: jest.fn().mockResolvedValue({
                data: 'base64imgdata',
                mimetype: 'image/png',
                filename: 'proof.png'
            })
        };

        const { uploadProofBase64, createPaymentConfirmation } = require('../src/services/isp.service');

        await handleMessage(phone, '', 'billing', sendFn, 'Budi', rawMsg);

        expect(rawMsg.downloadMedia).toHaveBeenCalled();
        expect(uploadProofBase64).toHaveBeenCalledWith('base64imgdata', 'image/png', 'proof.png');
        expect(createPaymentConfirmation).toHaveBeenCalledWith(10, 5, '/uploads/payment-proofs/test.png', 'Diunggah via chatbot WA', '');
        expect(database.upsertSession).toHaveBeenCalledWith(phone, 'billing', 'REG_MENU', expect.any(Object));
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('verifikasi (pending)'));
    });

    it('REG_MENU handles option 2 triggers and transitions to WAITING_PAYMENT_METHOD', async () => {
        mockFindCustomersByPhone.mockResolvedValue([{ id: 5, name: 'Budi', address: 'Jl. Mawar' }]);
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'REG_MENU',
            form_data: { customerId: 5, customerName: 'Budi' },
        });
        mockGetActiveBill.mockResolvedValue({
            id: 10,
            status: 'belum_bayar',
            periode: '2026-06',
            nominal: 150000,
            jatuh_tempo: '2026-06-30',
            invoice_number: 'INV-1',
        });

        await handleMessage(phone, '2', 'billing', sendFn);

        expect(database.upsertSession).toHaveBeenCalledWith(phone, 'billing', 'WAITING_PAYMENT_METHOD', expect.objectContaining({
            unpaidBills: [{ billId: 10, customerId: 5 }]
        }));
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('Bayar pake apa ?'));
    });

    it('WAITING_PAYMENT_METHOD option 1 transitions to WAITING_PROOF', async () => {
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'WAITING_PAYMENT_METHOD',
            form_data: {
                customerId: 5,
                customerName: 'Budi',
                unpaidBills: [{ billId: 10, customerId: 5 }]
            },
        });

        await handleMessage(phone, '1', 'billing', sendFn);

        expect(database.upsertSession).toHaveBeenCalledWith(phone, 'billing', 'WAITING_PROOF', expect.any(Object));
        expect(sendFn).toHaveBeenCalledWith('billing', phone, expect.stringContaining('bukti pembayaran'));
    });

    it('WAITING_PAYMENT_METHOD option 2 records cash payment and replies "baik, akan kami konfirmasi"', async () => {
        mockSessions.set(phone, {
            phone,
            account_id: 'billing',
            state: 'WAITING_PAYMENT_METHOD',
            form_data: {
                customerId: 5,
                customerName: 'Budi',
                unpaidBills: [{ billId: 10, customerId: 5 }]
            },
        });

        const { createPaymentConfirmation } = require('../src/services/isp.service');

        await handleMessage(phone, '2', 'billing', sendFn);

        expect(createPaymentConfirmation).toHaveBeenCalledWith(10, 5, null, 'Cash', '');
        expect(database.upsertSession).toHaveBeenCalledWith(phone, 'billing', 'REG_MENU', expect.any(Object));
        expect(sendFn).toHaveBeenCalledWith('billing', phone, 'baik, akan kami konfirmasi');
    });
});

