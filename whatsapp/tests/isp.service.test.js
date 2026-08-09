const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('axios', () => ({
    create: jest.fn(() => ({ get: mockGet, post: mockPost })),
}));

const service = require('../src/services/isp.service');

describe('ISP service adapter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('findCustomerByPhone mengembalikan pelanggan pertama', async () => {
        mockGet.mockResolvedValueOnce({ data: { data: [{ id: 7, nama: 'Budi' }] } });
        await expect(service.findCustomerByPhone('08123@s.whatsapp.net')).resolves.toEqual({ id: 7, nama: 'Budi' });
        expect(mockGet).toHaveBeenCalledWith('/api/v1/customers', { params: { wa_number: '628123', limit: 1 } });
    });

    it('getActiveBill mengembalikan null saat API error', async () => {
        mockGet.mockRejectedValueOnce(new Error('down'));
        await expect(service.getActiveBill(7)).resolves.toBeNull();
    });

    it('getPackageList fallback array kosong saat API gagal', async () => {
        mockGet.mockRejectedValueOnce(new Error('down'));
        await expect(service.getPackageList()).resolves.toEqual([]);
    });

    it('notifyAdminViaWA mengirim ke semua admin yang dikonfigurasi', async () => {
        process.env.ADMIN_WA_NUMBERS = '6281, 6282';
        const sendFn = jest.fn().mockResolvedValue(undefined);

        await service.notifyAdminViaWA({ phone: '628999@s.whatsapp.net', contactName: 'Ani', accountId: 'support' }, sendFn);

        expect(sendFn).toHaveBeenCalledTimes(2);
        expect(sendFn).toHaveBeenCalledWith('support', '6281', expect.stringContaining('Ani'));
        expect(sendFn).toHaveBeenCalledWith('support', '6282', expect.stringContaining('wa.me/+628999'));
    });
});
