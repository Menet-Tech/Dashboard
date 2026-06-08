-- Add voucher_discount and status pooling fields to pelanggan table
ALTER TABLE pelanggan ADD COLUMN voucher_discount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pelanggan ADD COLUMN ont_status TEXT;
ALTER TABLE pelanggan ADD COLUMN ont_ip TEXT;
ALTER TABLE pelanggan ADD COLUMN ont_uptime TEXT;
ALTER TABLE pelanggan ADD COLUMN ont_rx_power TEXT;
ALTER TABLE pelanggan ADD COLUMN ont_tx_power TEXT;
ALTER TABLE pelanggan ADD COLUMN pppoe_status TEXT;
ALTER TABLE pelanggan ADD COLUMN pppoe_ip TEXT;
ALTER TABLE pelanggan ADD COLUMN pppoe_uptime TEXT;
ALTER TABLE pelanggan ADD COLUMN last_sync_at TEXT;
