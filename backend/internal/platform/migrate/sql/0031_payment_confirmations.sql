-- Migration 0031: Create payment_confirmations table
CREATE TABLE IF NOT EXISTS payment_confirmations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tagihan_id INTEGER NOT NULL REFERENCES tagihan(id) ON DELETE CASCADE,
    pelanggan_id INTEGER NOT NULL REFERENCES pelanggan(id) ON DELETE CASCADE,
    bukti_transfer TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review', -- 'pending_review', 'approved', 'rejected'
    catatan TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_confirmations_status ON payment_confirmations(status);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_tagihan_id ON payment_confirmations(tagihan_id);
