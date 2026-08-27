-- Add bypassed_isolir column to pelanggan table for temporary isolir bypass
ALTER TABLE pelanggan ADD COLUMN bypassed_isolir BOOLEAN NOT NULL DEFAULT 0;
