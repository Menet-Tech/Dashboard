-- Add is_read and read_at fields to ticket_messages table
ALTER TABLE ticket_messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ticket_messages ADD COLUMN read_at TEXT;
