-- Migration 0049: Add header and footer templates for chatbot billing info
INSERT OR IGNORE INTO template_wa (nama, trigger_key, isi_template, is_active, is_custom)
VALUES
    ('Chatbot: Cek Tagihan Header', 'chatbot_tagihan_header', 'Halo {nama}, berikut detail tagihan Anda:', 1, 0),
    ('Chatbot: Cek Tagihan Footer', 'chatbot_tagihan_footer', 'Mohon lakukan pembayaran sebelum tanggal {jatuh_tempo} agar terhindar dari Pembatasan Layanan.

Rekening Pembayaran:
Bank Mandiri
1570006636691

Shopeepay, gopay
089621743796

Seabank
901096534584

a.n. Irfan Dharmawan

Untuk konfirmasi pembayaran & Pengaduan kendala dapat menghubungi kami melalui Pesan ini, atau Nomor di bawah ini.
087782297657 - Menet CS
08987700897 - Elam
089621743796 - Ipong

Atas perhatian dan kerja samanya, kami ucapkan terima kasih.
Hormat kami,
Tim Billing — MeNet Tech', 1, 0);
