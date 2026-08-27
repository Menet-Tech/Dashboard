-- Migration 0050: Add indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_pelanggan_nama ON pelanggan(nama);
CREATE INDEX IF NOT EXISTS idx_pelanggan_status ON pelanggan(status);
CREATE INDEX IF NOT EXISTS idx_pelanggan_is_trial ON pelanggan(is_trial);
CREATE INDEX IF NOT EXISTS idx_tagihan_status ON tagihan(status);
CREATE INDEX IF NOT EXISTS idx_tagihan_periode ON tagihan(periode);
CREATE INDEX IF NOT EXISTS idx_tagihan_jatuh_tempo ON tagihan(jatuh_tempo);
