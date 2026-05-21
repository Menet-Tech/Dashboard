CREATE INDEX IF NOT EXISTS idx_tagihan_pelanggan_id ON tagihan(pelanggan_id);
CREATE INDEX IF NOT EXISTS idx_tagihan_periode ON tagihan(periode);
CREATE INDEX IF NOT EXISTS idx_tagihan_status ON tagihan(status);
CREATE INDEX IF NOT EXISTS idx_pelanggan_paket_id ON pelanggan(paket_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_bill_id ON notification_logs(bill_id);
