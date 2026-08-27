-- Migration 0032: Add perpanjangan WA template
INSERT OR IGNORE INTO template_wa (id, nama, trigger_key, isi_template, is_active)
VALUES (6, 'Perpanjangan Tagihan', 'perpanjangan', 'Halo {nama}, tagihan internet Anda untuk periode {periode} sebesar {nominal} telah diperpanjang. Tagihan bulan depan akan digabungkan dengan periode ini.', 1);
