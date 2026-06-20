CREATE TABLE IF NOT EXISTS template_email (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    trigger_key TEXT NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    isi_template TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO template_email (nama, trigger_key, subject, isi_template, is_active)
VALUES
    ('Pengingat H-3 Jatuh Tempo', 'reminder_custom', 'Pengingat Tagihan Internet {invoice_number}', 'Yth. {nama},

Ini adalah pengingat bahwa tagihan internet Anda periode {periode} dengan nomor invoice {invoice_number} sebesar {nominal} akan jatuh tempo pada tanggal {jatuh_tempo}.

Mohon lakukan pembayaran sebelum jatuh tempo untuk menghindari pembatasan layanan.

Terima kasih,
Layanan Billing', 1),
    ('Tagihan Jatuh Tempo Hari Ini', 'jatuh_tempo', 'Tagihan Internet Jatuh Hari Ini - {invoice_number}', 'Yth. {nama},

Hari ini adalah tanggal jatuh tempo pembayaran internet Anda periode {periode} dengan nomor invoice {invoice_number} sebesar {nominal}.

Mohon segera melakukan pembayaran agar layanan Anda tidak terputus.

Terima kasih,
Layanan Billing', 1),
    ('Layanan Terisolir (Overdue 5 Hari)', 'limit_5hari', 'Pemberitahuan Layanan Terisolir - {invoice_number}', 'Yth. {nama},

Layanan internet Anda untuk nomor invoice {invoice_number} periode {periode} telah diisolir sementara karena pembayaran melewati batas jatuh tempo (menunggak {hari_limit} hari).

Layanan akan otomatis aktif kembali setelah pembayaran dikonfirmasi.

Terima kasih,
Layanan Billing', 1),
    ('Pembayaran Lunas', 'lunas', 'Pembayaran Berhasil - {invoice_number}', 'Yth. {nama},

Terima kasih, pembayaran Anda untuk invoice {invoice_number} periode {periode} sebesar {nominal} telah kami terima dan berstatus Lunas.

Terima kasih telah menggunakan layanan kami.

Terima kasih,
Layanan Billing', 1);
