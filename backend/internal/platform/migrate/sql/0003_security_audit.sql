CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier_time
    ON login_attempts(identifier, attempted_at);

CREATE INDEX IF NOT EXISTS idx_action_logs_created_at
    ON action_logs(created_at DESC);
