-- Migration 0039: Add period column to referral_withdrawals for mutual exclusion with voucher per period
ALTER TABLE referral_withdrawals ADD COLUMN period TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_period ON referral_withdrawals(period);
