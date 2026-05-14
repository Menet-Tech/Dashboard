-- Add trial period fields to pelanggan table
ALTER TABLE pelanggan ADD COLUMN is_trial INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pelanggan ADD COLUMN trial_started_at TEXT;
ALTER TABLE pelanggan ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 3;

-- Create index for trial queries
CREATE INDEX IF NOT EXISTS idx_pelanggan_is_trial_started ON pelanggan(is_trial, trial_started_at);

-- Add trial-related settings
INSERT OR IGNORE INTO pengaturan(key, value, updated_at) VALUES
    ('trial_period_days', '3', CURRENT_TIMESTAMP),
    ('trial_auto_generate_bills', '1', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO template_wa (nama, trigger_key, isi_template, is_active, updated_at)
VALUES (
    'Trial Berakhir',
    'trial_expired',
    'Halo {nama}, masa trial Anda sudah berakhir. Tagihan pertama dengan nomor invoice {invoice_number} untuk periode {periode} sebesar {nominal} sudah dibuat dan akan jatuh tempo pada {jatuh_tempo}.',
    1,
    CURRENT_TIMESTAMP
);
