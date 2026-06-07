-- Migration 0013: Add custom chatbot and technician alert templates
INSERT OR IGNORE INTO template_wa (nama, trigger_key, isi_template, is_active)
VALUES
    ('Chatbot: Trial Status', 'chatbot_trial', 'halo {nama} terimakaish telah mengugunakan menet, kamu sedang ada di dalam masa trial, tidak akan ada tagihan selama {hari_limit} hari kedepan, terimakasih.', 1),
    ('Chatbot: Tidak Ada Tagihan', 'chatbot_no_bill', 'halo {nama}, kamu gak ada tagihan aktif di periode {periode}, terimakasih telah menggunakan menet', 1),
    ('Chatbot: Tagihan Jatuh Tempo', 'chatbot_due_bill', 'halo {nama}, tagihan kamu sudah jatuh tempo, mohon segera di bayar, agar service tidak terganggu', 1),
    ('Chatbot: Tagihan Aktif', 'chatbot_active_bill', 'halo {nama}, kamu punya tagihan aktif untuk periode {periode} dengan nominal sebesar {nominal}, dan akan jatuh tempo pada {jatuh_tempo}.', 1),
    ('Alert Teknisi: Kendala Support', 'alert_teknisi', '🔧 *Laporan Kendala Baru*\nNama: {nama}\nAlamat: {alamat}\nKendala: {kendala}\nNomor WA: wa.me/+{no_hp}', 1);
