/**
 * tests/formatter.test.js
 * Test untuk utility formatPhoneNumber
 */
const { formatPhoneNumber } = require('../src/utils/formatter');

describe('📞 Formatter — formatPhoneNumber()', () => {
    it('harus mengubah angka 0xxx menjadi 62xxx@s.whatsapp.net', () => {
        expect(formatPhoneNumber('081234567890')).toBe('6281234567890@s.whatsapp.net');
    });

    it('harus menambahkan @s.whatsapp.net jika sudah pakai kode negara', () => {
        expect(formatPhoneNumber('6281234567890')).toBe('6281234567890@s.whatsapp.net');
    });

    it('harus diteruskan apa adanya jika sudah dalam format WhatsApp (@s.whatsapp.net)', () => {
        expect(formatPhoneNumber('6281234567890@s.whatsapp.net')).toBe('6281234567890@s.whatsapp.net');
    });

    it('harus diteruskan apa adanya jika sudah dalam format grup (@g.us)', () => {
        expect(formatPhoneNumber('120363xxxxxx@g.us')).toBe('120363xxxxxx@g.us');
    });

    it('harus diteruskan apa adanya jika sudah dalam format LID (@lid)', () => {
        expect(formatPhoneNumber('44084114776150@lid')).toBe('44084114776150@lid');
    });

    it('harus membersihkan karakter non-digit seperti +, -, dan spasi', () => {
        expect(formatPhoneNumber('+62-812-3456-7890')).toBe('6281234567890@s.whatsapp.net');
    });
});
