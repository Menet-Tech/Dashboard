-- Migration 0052: Add Trial Started WhatsApp Template
INSERT OR IGNORE INTO template_wa (nama, trigger_key, isi_template, is_active, is_custom, updated_at)
VALUES (
    'Trial Dimulai',
    'trial_started',
    'Halo {nama}, selamat datang di MeNet Tech! Layanan internet Anda telah aktif dalam masa TRIAL selama {hari_limit} hari. Masa trial akan berakhir pada {tanggal_akhir_trial}. Terima kasih.

Pengaduan kendala dapat menghubungi kami melalui Pesan ini, atau Nomor di bawah ini.
087782297657 - Menet CS
08987700897 - Elam
089621743796 - Ipong',
    1,
    1,
    CURRENT_TIMESTAMP
);
