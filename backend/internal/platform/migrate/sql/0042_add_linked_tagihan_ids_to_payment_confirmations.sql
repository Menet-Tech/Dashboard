-- Migration 0042: Add linked_tagihan_ids column to payment_confirmations table
ALTER TABLE payment_confirmations ADD COLUMN linked_tagihan_ids TEXT;
