-- Add is_manual column to whatsapp_queue table to bypass queue throttle delay for manual notifications
ALTER TABLE whatsapp_queue ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0;
