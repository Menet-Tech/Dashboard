-- Migration to add csrf_token column to sessions table for Bug #23
ALTER TABLE sessions ADD COLUMN csrf_token TEXT;
