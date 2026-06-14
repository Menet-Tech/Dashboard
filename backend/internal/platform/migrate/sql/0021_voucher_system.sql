CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'one-time', 'multi-use', 'permanent'
    total_cycles INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pelanggan_id INTEGER NOT NULL REFERENCES pelanggan(id) ON DELETE CASCADE,
    voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    remaining_cycles INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voucher_usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pelanggan_id INTEGER NOT NULL REFERENCES pelanggan(id) ON DELETE CASCADE,
    voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    tagihan_id INTEGER NOT NULL REFERENCES tagihan(id) ON DELETE CASCADE,
    amount_applied INTEGER NOT NULL,
    cycle_number INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add voucher_auto_apply field to pelanggan table
ALTER TABLE pelanggan ADD COLUMN voucher_auto_apply INTEGER NOT NULL DEFAULT 1;

-- Insert seed vouchers
INSERT OR IGNORE INTO vouchers (code, amount, type, total_cycles, description) VALUES ('DISKON10K', 10000, 'one-time', 1, 'Voucher Diskon 10 Ribu Sekali Pakai');
INSERT OR IGNORE INTO vouchers (code, amount, type, total_cycles, description) VALUES ('DISKON50K2X', 50000, 'multi-use', 2, 'Voucher Diskon 50 Ribu untuk 2 Bulan');
INSERT OR IGNORE INTO vouchers (code, amount, type, total_cycles, description) VALUES ('DISKONPERM', 25000, 'permanent', 0, 'Voucher Diskon 25 Ribu Permanen');
