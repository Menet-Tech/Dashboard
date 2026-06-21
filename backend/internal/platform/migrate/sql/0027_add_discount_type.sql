-- Add discount type column to pelanggan table
ALTER TABLE pelanggan ADD COLUMN tipe_diskon TEXT NOT NULL DEFAULT 'flat';
