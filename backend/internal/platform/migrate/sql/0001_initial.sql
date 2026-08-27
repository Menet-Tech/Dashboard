CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paket (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    kecepatan_mbps INTEGER NOT NULL DEFAULT 0,
    harga INTEGER NOT NULL DEFAULT 0,
    deskripsi TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pelanggan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    paket_id INTEGER NOT NULL,
    user_pppoe TEXT,
    password_pppoe TEXT,
    nomor_wa TEXT,
    sn_ont TEXT,
    tgl_jatuh_tempo INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    alamat TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (paket_id) REFERENCES paket(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS tagihan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pelanggan_id INTEGER NOT NULL,
    paket_id INTEGER NOT NULL,
    periode TEXT NOT NULL,
    invoice_number TEXT NOT NULL UNIQUE,
    nominal INTEGER NOT NULL DEFAULT 0,
    jatuh_tempo TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'belum_bayar',
    paid_at TEXT,
    payment_method TEXT,
    proof_path TEXT,
    paid_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE,
    FOREIGN KEY (paket_id) REFERENCES paket(id) ON DELETE RESTRICT,
    FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (pelanggan_id, periode)
);

CREATE TABLE IF NOT EXISTS payment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tagihan_id INTEGER NOT NULL,
    method TEXT NOT NULL,
    amount INTEGER NOT NULL,
    paid_at TEXT NOT NULL,
    note TEXT,
    proof_path TEXT,
    created_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tagihan_id) REFERENCES tagihan(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS template_wa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    trigger_key TEXT NOT NULL UNIQUE,
    isi_template TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pengaturan (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    pelanggan_id INTEGER,
    action TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pelanggan_status ON pelanggan(status);
CREATE INDEX IF NOT EXISTS idx_tagihan_status ON tagihan(status);
CREATE INDEX IF NOT EXISTS idx_tagihan_periode ON tagihan(periode);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

INSERT OR IGNORE INTO users (id, username, password_hash, role)
VALUES (1, 'admin', 'BOOTSTRAP_PENDING', 'admin');

INSERT OR IGNORE INTO template_wa (id, nama, trigger_key, isi_template, is_active)
VALUES
    (1, 'Reminder Custom', 'reminder_custom', 'Halo {nama}, tagihan internet Anda untuk periode {periode} akan jatuh tempo pada {jatuh_tempo}.', 1),
    (2, 'Jatuh Tempo', 'jatuh_tempo', 'Halo {nama}, tagihan internet Anda sudah jatuh tempo pada {jatuh_tempo}. Mohon segera melakukan pembayaran.', 1),
    (3, 'Limit 5 Hari', 'limit_5hari', 'Halo {nama}, layanan Anda dibatasi karena tagihan belum dibayar selama 5 hari setelah jatuh tempo.', 1),
    (4, 'Lunas', 'lunas', 'Terima kasih {nama}, pembayaran untuk invoice {invoice_number} sudah kami terima dan status Anda dinyatakan lunas.', 1);
