-- Add is_online column to mikrotik_routers table
ALTER TABLE mikrotik_routers ADD COLUMN is_online INTEGER NOT NULL DEFAULT 0;
