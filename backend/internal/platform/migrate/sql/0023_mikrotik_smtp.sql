CREATE TABLE IF NOT EXISTS mikrotik_routers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    host TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE paket ADD COLUMN ip_pool TEXT;
ALTER TABLE paket ADD COLUMN local_address TEXT;
ALTER TABLE pelanggan ADD COLUMN email TEXT;

-- Migrate existing MikroTik settings if configured
INSERT INTO mikrotik_routers (nama, host, username, password, is_active)
SELECT 'Router Utama', 
       (SELECT value FROM pengaturan WHERE key = 'mikrotik_host'),
       (SELECT value FROM pengaturan WHERE key = 'mikrotik_user'),
       (SELECT value FROM pengaturan WHERE key = 'mikrotik_pass'),
       1
WHERE EXISTS (
    SELECT 1 FROM pengaturan 
    WHERE key = 'mikrotik_host' 
      AND value IS NOT NULL 
      AND value != ''
);
