CREATE TABLE IF NOT EXISTS notification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    trigger_key TEXT NOT NULL,
    sent_to TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    response_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bill_id) REFERENCES tagihan(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_bill_trigger ON notification_logs(bill_id, trigger_key);

INSERT OR IGNORE INTO pengaturan(key, value, updated_at) VALUES
    ('billing_reminder_days', '3', CURRENT_TIMESTAMP),
    ('billing_limit_days', '5', CURRENT_TIMESTAMP),
    ('billing_menunggak_days', '30', CURRENT_TIMESTAMP),
    ('wa_gateway_url', '', CURRENT_TIMESTAMP),
    ('wa_api_key', '', CURRENT_TIMESTAMP),
    ('wa_account_id', 'default', CURRENT_TIMESTAMP),
    ('worker_interval_seconds', '60', CURRENT_TIMESTAMP);
