-- Migration 0053: Add Auto Reply Payment Proof Template
INSERT OR IGNORE INTO template_wa (nama, trigger_key, isi_template, is_active, is_custom, updated_at)
VALUES (
    'Auto Reply: Sukses Deteksi Bukti Transfer',
    'auto_reply_payment_proof',
    'Terima kasih! Bukti transfer Anda telah diterima secara otomatis dan sedang dalam proses verifikasi (pending) oleh admin.',
    1,
    0,
    CURRENT_TIMESTAMP
);
