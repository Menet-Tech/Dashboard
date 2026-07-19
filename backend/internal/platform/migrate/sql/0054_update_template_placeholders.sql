-- Migration 0054: Update template placeholders and trial templates contact info
UPDATE template_wa
SET isi_template = REPLACE(
        isi_template,
        '{tgl_jatuh_tempo}',
        '{jatuh_tempo}'
    )
WHERE isi_template LIKE '%{tgl_jatuh_tempo}%';
UPDATE template_wa
SET isi_template = 'Halo {nama}, selamat datang di MeNet Tech! Layanan internet Anda telah aktif dalam masa TRIAL selama {hari_limit} hari. Masa trial akan berakhir pada {tanggal_akhir_trial}. Terima kasih.

Pengaduan kendala dapat menghubungi kami melalui Pesan ini, atau Nomor di bawah ini.
087782297657 - Menet CS
08987700897 - Elam
089621743796 - Ipong'
WHERE trigger_key = 'trial_started';
UPDATE template_wa
SET isi_template = 'Halo {nama}, masa trial Anda sudah berakhir. Tagihan pertama dengan nomor invoice {invoice_number} untuk periode {periode} sebesar {nominal} sudah dibuat dan akan jatuh tempo pada {jatuh_tempo}.

Pengaduan kendala dapat menghubungi kami melalui Pesan ini, atau Nomor di bawah ini.
087782297657 - Menet CS
08987700897 - Elam
089621743796 - Ipong'
WHERE trigger_key = 'trial_expired';