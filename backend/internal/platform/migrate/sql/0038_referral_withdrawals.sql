-- Migration 0038: Create referral_withdrawals table
CREATE TABLE IF NOT EXISTS referral_withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pelanggan_id INTEGER NOT NULL REFERENCES pelanggan(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    method TEXT NOT NULL,
    payment_target TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    proof_path TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_status ON referral_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_pelanggan_id ON referral_withdrawals(pelanggan_id);
