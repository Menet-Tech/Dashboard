-- Migration 0046: Add message column to notification_logs
-- This column will store the actual rendered text of the notification,
-- enabling manual fallback to wa.me (WhatsApp Web) from the history log if the gateway is offline.

ALTER TABLE notification_logs ADD COLUMN message TEXT DEFAULT '';
