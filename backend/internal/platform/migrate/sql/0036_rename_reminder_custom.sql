-- Migration 0036: Rename reminder_custom trigger_key to reminder-h5 and insert chatbot_faq template
UPDATE template_wa SET trigger_key = 'reminder-h5', nama = 'Reminder H-5' WHERE trigger_key = 'reminder_custom';
UPDATE template_email SET trigger_key = 'reminder-h5', nama = 'Pengingat H-5 Jatuh Tempo' WHERE trigger_key = 'reminder_custom';

INSERT INTO template_wa (nama, trigger_key, isi_template, is_active)
SELECT 'Chatbot FAQ', 'chatbot_faq', 'halo, ini adalah pertanyaan yang paling umum di tanyakan,

> Kapan wifi dipasang setelah daftar?
> Pemasangan dilakukan setiap hari Sabtu & Minggu.

> Bagaimana cara bayar tagihan?
> Tagihan bisa dibayar via transfer bank atau e-wallet sesuai info yang dikirim admin.

> Wifi saya lambat, kenapa?
> Coba restart router dulu. Jika masih lambat, kirim laporan lewat menu 2.

> Bisakah saya ganti paket?
> Bisa! Hubungi admin lewat menu 5 untuk info lebih lanjut.', 1
WHERE NOT EXISTS (SELECT 1 FROM template_wa WHERE trigger_key = 'chatbot_faq');
