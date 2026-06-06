-- Add discount and referral columns to pelanggan table
ALTER TABLE pelanggan ADD COLUMN diskon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pelanggan ADD COLUMN referral_code TEXT;
ALTER TABLE pelanggan ADD COLUMN referred_by_id INTEGER REFERENCES pelanggan(id) ON DELETE SET NULL;
ALTER TABLE pelanggan ADD COLUMN referral_balance INTEGER NOT NULL DEFAULT 0;

-- Create index for referral code
CREATE UNIQUE INDEX IF NOT EXISTS idx_pelanggan_referral_code ON pelanggan(referral_code);

-- Add discount columns to tagihan table
ALTER TABLE tagihan ADD COLUMN diskon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tagihan ADD COLUMN diskon_referral INTEGER NOT NULL DEFAULT 0;
