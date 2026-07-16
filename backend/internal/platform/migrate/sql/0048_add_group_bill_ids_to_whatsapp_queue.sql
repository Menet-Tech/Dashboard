-- Migration 0048: Store all bill IDs represented by a grouped WhatsApp queue row.
-- This lets the worker mark every invoice sent/failed only after the gateway result is known.

ALTER TABLE whatsapp_queue ADD COLUMN group_bill_ids TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_bill_trigger_to
ON whatsapp_queue(bill_id, trigger_key, to_number, status);
