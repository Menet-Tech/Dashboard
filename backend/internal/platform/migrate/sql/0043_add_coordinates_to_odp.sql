-- Migration 0043: Add latitude and longitude columns to odp table
ALTER TABLE odp ADD COLUMN latitude REAL NOT NULL DEFAULT 0.0;
ALTER TABLE odp ADD COLUMN longitude REAL NOT NULL DEFAULT 0.0;
