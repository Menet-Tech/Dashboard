-- Migration 0035: Premium WhatsApp templates update
UPDATE template_wa
SET isi_template = 'Pelanggan Yth,
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
Tim Billing — MeNet Tech'
WHERE trigger_key = 'reminder_custom';

UPDATE template_wa
SET isi_template = 'Pelanggan Yth,
Bapak/Ibu {nama},

Pemberitahuan bahwa tagihan internet Anda periode {periode} sebesar {nominal} JATUH TEMPO HARI INI ({tgl_jatuh_tempo}).

Detail Layanan:
> Paket: {paket}
> Kecepatan: {kecepatan_paket} Mbps

Mohon segera lakukan pembayaran hari ini agar terhindar dari Pembatasan Layanan.

Rekening Pembayaran:
Bank Mandiri - 1570006636691
Shopeepay, gopay - 089621743796
Seabank - 901096534584 
a.n. Irfan Dharmawan 

Jika sudah melakukan pembayaran, silakan kirimkan bukti transfer melalui chat ini.

Hormat kami,
Tim Billing — MeNet Tech'
WHERE trigger_key = 'jatuh_tempo';

UPDATE template_wa
SET isi_template = 'Pelanggan Yth,
Bapak/Ibu {nama},

Kami informasikan bahwa layanan internet Anda untuk Paket {paket} telah DIBATASI (ISOLIR) sementara karena terdapat tunggakan tagihan periode {periode} sebesar {nominal} yang telah melewati batas jatuh tempo.

Untuk mengaktifkan kembali layanan internet Anda, mohon segera melakukan pembayaran tagihan Anda.

Rekening Pembayaran:
Bank Mandiri - 1570006636691
Shopeepay, gopay - 089621743796
Seabank - 901096534584 
a.n. Irfan Dharmawan 

Setelah melakukan pembayaran, layanan akan otomatis aktif kembali setelah konfirmasi pembayaran disetujui. Silakan kirimkan bukti transfer Anda melalui chat ini.

Hormat kami,
Tim Billing — MeNet Tech'
WHERE trigger_key = 'limit_5hari';

UPDATE template_wa
SET isi_template = 'Pelanggan Yth,
Bapak/Ibu {nama},

Kami informasikan bahwa akan dilakukan pemeliharaan jaringan (maintenance) pada area Anda pada tanggal {tanggal_maintenance} mulai pukul {waktu_maintenance}.

Selama proses pemeliharaan berlangsung, layanan internet mungkin akan mengalami gangguan atau terputus sementara. Kami akan berupaya menyelesaikan pemeliharaan ini secepat mungkin.

Mohon maaf atas ketidaknyamanan yang ditimbulkan. Terima kasih atas pengertian dan kerja samanya.

Hormat kami,
Tim Support — MeNet Tech'
WHERE trigger_key = 'maintenance';
