-- Migration 0037: Add tagihan-h7, reminder-h3, and isolir_20hari triggers
INSERT OR IGNORE INTO template_wa (nama, trigger_key, isi_template, is_active)
VALUES
    ('Tagihan H-7', 'tagihan-h7', 'Pelanggan Yth,
Bapak/Ibu {nama},

Tagihan Anda periode {periode} sebesar {nominal}., dengan detail berikut

Paket: {paket}
Harga: {harga_paket}.

{diskon}

Total Tagihan: {nominal}.

Mohon lakukan pembayaran sebelum tanggal {tgl_jatuh_tempo} agar terhindar dari Pembatasan Layanan.

jika sudah melakukan pembayaran, kamu dapat memberikan bukti transfer ke sini atau balas dengan "ya saya sudah bayar" jika kamu membayar dengan cash

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
Tim Billing — MeNet Tech', 1),

    ('Reminder H-3', 'reminder-h3', 'Pelanggan Yth,
Bapak/Ibu {nama},

Meningatkan kembali bahwa tagihan internet Anda periode {periode} sebesar {nominal} akan jatuh tempo dalam 3 hari ({tgl_jatuh_tempo}).

Mohon lakukan pembayaran sebelum tanggal jatuh tempo agar terhindar dari Pembatasan Layanan.

Jika sudah melakukan pembayaran, silakan kirimkan bukti transfer melalui chat ini. Terima kasih.

Hormat kami,
Tim Billing — MeNet Tech', 1),

    ('Isolir 20 Hari', 'isolir_20hari', 'Pelanggan Yth,
Bapak/Ibu {nama},

Kami informasikan bahwa layanan internet Anda untuk Paket {paket} telah DINONAKTIFKAN SEPENUHNYA (ISOLIR) karena terdapat tunggakan tagihan periode {periode} sebesar {nominal} yang telah melewati 15 hari masa pembatasan (limit).

Untuk mengaktifkan kembali layanan internet Anda, mohon segera melakukan pembayaran tagihan Anda dan hubungi admin.

Rekening Pembayaran:
Bank Mandiri - 1570006636691
Shopeepay, gopay - 089621743796
Seabank - 901096534584 
a.n. Irfan Dharmawan 

Hormat kami,
Tim Billing — MeNet Tech', 1);

INSERT OR IGNORE INTO template_email (nama, trigger_key, subject, isi_template, is_active)
VALUES
    ('Tagihan H-7', 'tagihan-h7', 'Tagihan Internet Baru - {invoice_number}', 'Yth. {nama},

Ini adalah pemberitahuan tagihan internet Anda periode {periode} dengan nomor invoice {invoice_number} sebesar {nominal} yang akan jatuh tempo pada tanggal {jatuh_tempo}.

Mohon lakukan pembayaran sebelum jatuh tempo untuk menghindari pembatasan layanan.

Terima kasih,
Layanan Billing', 1),

    ('Pengingat H-3', 'reminder-h3', 'Pengingat Tagihan Internet - {invoice_number}', 'Yth. {nama},

Ini adalah pengingat bahwa tagihan internet Anda periode {periode} dengan nomor invoice {invoice_number} sebesar {nominal} akan jatuh tempo dalam 3 hari ({jatuh_tempo}).

Mohon lakukan pembayaran sebelum jatuh tempo untuk menghindari pembatasan layanan.

Terima kasih,
Layanan Billing', 1),

    ('Layanan Dinonaktifkan (Overdue 20 Hari)', 'isolir_20hari', 'Pemberitahuan Layanan Dinonaktifkan - {invoice_number}', 'Yth. {nama},

Layanan internet Anda untuk nomor invoice {invoice_number} periode {periode} telah dinonaktifkan sepenuhnya karena pembayaran melewati 15 hari sejak masa pembatasan (limit).

Silakan lakukan pembayaran dan hubungi admin untuk mengaktifkan kembali layanan Anda.

Terima kasih,
Layanan Billing', 1);
