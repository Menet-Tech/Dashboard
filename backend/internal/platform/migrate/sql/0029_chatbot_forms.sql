-- Migration 0029: Create chatbot_forms table
CREATE TABLE IF NOT EXISTS chatbot_forms (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    account_id  TEXT NOT NULL DEFAULT 'default',
    data        TEXT NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL
);
