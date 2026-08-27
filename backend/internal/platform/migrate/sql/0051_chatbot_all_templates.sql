-- Migration 0051: Add all remaining hardcoded chatbot templates to database
INSERT OR IGNORE INTO template_wa (nama, trigger_key, isi_template, is_active)
VALUES
    ('Chatbot: Menu Pelanggan (Ada Tagihan)', 'chatbot_menu_reg_has_bills', 'hai, selamat {greeting} {nama}, apa ada yang bisa di bantu ?
ketik {trigger_billing} untuk cek tagihan anda
ketik 2 konfirmasi pembayaran
ketik {trigger_support} jika ada kendala mengenai wifi
ketik {trigger_packages} untuk melihat paket yang disediakan
ketik {trigger_faq} untuk melihat pertanyaan umum
ketik {trigger_admin} untuk chat ke admin
ketik 7 untuk cek referral dan klaim
ketik 8 untuk ganti nama/password wifi', 1),

    ('Chatbot: Menu Pelanggan (Tanpa Tagihan)', 'chatbot_menu_reg_no_bills', 'hai, selamat {greeting} {nama}, apa ada yang bisa di bantu ?
ketik {trigger_billing} untuk cek tagihan anda
ketik {trigger_support} jika ada kendala mengenai wifi
ketik {trigger_packages} untuk melihat paket yang disediakan
ketik {trigger_faq} untuk melihat pertanyaan umum
ketik {trigger_admin} untuk chat ke admin
ketik 6 untuk cek referral dan klaim
ketik 7 untuk ganti nama/password wifi', 1),

    ('Chatbot: FAQ Umum', 'chatbot_faq', 'halo, ini adalah pertanyaan yang paling umum di tanyakan,

> Kapan wifi dipasang setelah daftar?
> Pemasangan dilakukan setiap hari Sabtu & Minggu.

> Bagaimana cara bayar tagihan?
> Tagihan bisa dibayar via transfer bank atau e-wallet sesuai info yang dikirim admin.

> Wifi saya lambat, kenapa?
> Coba restart router dulu. Jika masih lambat, kirim laporan lewat menu 2.

> Bisakah saya ganti paket?
> Bisa! Hubungi admin lewat menu 5 untuk info lebih lanjut.', 1),

    ('Chatbot: Error Perintah Tidak Dikenal', 'chatbot_error_unknown', 'Hm, aku kurang ngerti 😅

{menu_text}', 1);
