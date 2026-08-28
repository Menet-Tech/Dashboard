-- Migration 0057: Make bill_id nullable in notification_logs
-- This is required because non-billing events (like trial_started) don't have a bill_id,
-- and inserting 0 causes foreign key constraint violations in production.

ALTER TABLE notification_logs ALTER COLUMN bill_id DROP NOT NULL;
