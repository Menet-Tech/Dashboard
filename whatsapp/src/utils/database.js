const logger = require('./logger');

let db;

const getDb = () => {
    if (!db) {
        const Database = require('better-sqlite3');
        db = new Database('wa_gateway.db');
        db.pragma('journal_mode = WAL');

        // Tabel pesan terkirim/masuk
        db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id          TEXT PRIMARY KEY,
                to_number   TEXT NOT NULL,
                body        TEXT NOT NULL,
                type        TEXT NOT NULL DEFAULT 'text',
                status      TEXT NOT NULL DEFAULT 'sent',
                wa_message_id TEXT,
                created_at  TEXT NOT NULL,
                sent_at     TEXT
            );
        `);

        // Migration: Tambah kolom untuk Inbound & Chat Sync
        try { db.exec("ALTER TABLE messages ADD COLUMN direction TEXT DEFAULT 'outbound'"); } catch (e) {}
        try { db.exec("ALTER TABLE messages ADD COLUMN from_number TEXT"); } catch (e) {}
        try { db.exec("ALTER TABLE messages ADD COLUMN account_id TEXT DEFAULT 'default'"); } catch (e) {}

        // Tabel sesi chatbot per nomor WA (state machine)
        db.exec(`
            CREATE TABLE IF NOT EXISTS chatbot_sessions (
                phone       TEXT PRIMARY KEY,
                account_id  TEXT NOT NULL DEFAULT 'default',
                state       TEXT NOT NULL DEFAULT 'IDLE',
                form_data   TEXT NOT NULL DEFAULT '{}',
                updated_at  TEXT NOT NULL
            );
        `);

        // Tabel form yang masuk (pendaftaran & tiket support)
        db.exec(`
            CREATE TABLE IF NOT EXISTS contact_forms (
                id          TEXT PRIMARY KEY,
                type        TEXT NOT NULL,
                phone       TEXT NOT NULL,
                account_id  TEXT NOT NULL DEFAULT 'default',
                data        TEXT NOT NULL DEFAULT '{}',
                status      TEXT NOT NULL DEFAULT 'pending',
                created_at  TEXT NOT NULL
            );
        `);

        // Tabel akun WhatsApp yang persisten (multi-account)
        db.exec(`
            CREATE TABLE IF NOT EXISTS wa_accounts (
                id          TEXT PRIMARY KEY,
                label       TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL
            );
        `);

        logger.info('[DB] SQLite database initialized: wa_gateway.db');
    }
    return db;
};

/**
 * Simpan pesan terkirim/masuk ke database
 */
const saveMessage = (to, body, type = 'text', waMessageId = null, direction = 'outbound', fromNumber = null, accountId = 'default') => {
    const db = getDb();
    const id = require('crypto').randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    const stmt = db.prepare(`
        INSERT INTO messages (id, to_number, body, type, status, wa_message_id, created_at, sent_at, direction, from_number, account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const status = direction === 'inbound' ? 'received' : 'sent';
    stmt.run(id, to, body, type, status, waMessageId, now, now, direction, fromNumber, accountId);
    return id;
};

const getMessages = (limit = 100, offset = 0, accountId = null) => {
    const db = getDb();
    if (accountId) {
        return db.prepare('SELECT * FROM messages WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(accountId, limit, offset);
    }
    return db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
};

const getMessageById = (id) => {
    const db = getDb();
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
};

// ─── Chatbot Sessions ───────────────────────────────────────────────────────

const getSession = (phone) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM chatbot_sessions WHERE phone = ?').get(phone);
    if (!row) return null;
    return { ...row, form_data: JSON.parse(row.form_data) };
};

const upsertSession = (phone, accountId, state, formData = {}) => {
    const db = getDb();
    db.prepare(`
        INSERT INTO chatbot_sessions (phone, account_id, state, form_data, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET
            account_id = excluded.account_id,
            state      = excluded.state,
            form_data  = excluded.form_data,
            updated_at = excluded.updated_at
    `).run(phone, accountId, state, JSON.stringify(formData), new Date().toISOString());
};

const deleteSession = (phone) => {
    const db = getDb();
    db.prepare('DELETE FROM chatbot_sessions WHERE phone = ?').run(phone);
};

const getAllSessions = () => {
    const db = getDb();
    return db.prepare('SELECT * FROM chatbot_sessions ORDER BY updated_at DESC').all()
        .map(row => ({ ...row, form_data: JSON.parse(row.form_data) }));
};

// ─── Contact Forms ──────────────────────────────────────────────────────────

const saveContactForm = (type, phone, accountId, data) => {
    const db = getDb();
    const id = require('crypto').randomBytes(8).toString('hex');
    db.prepare(`
        INSERT INTO contact_forms (id, type, phone, account_id, data, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, type, phone, accountId, JSON.stringify(data), new Date().toISOString());
    return id;
};

const getForms = (type = null, limit = 50) => {
    const db = getDb();
    if (type) {
        return db.prepare('SELECT * FROM contact_forms WHERE type = ? ORDER BY created_at DESC LIMIT ?').all(type, limit)
            .map(row => ({ ...row, data: JSON.parse(row.data) }));
    }
    return db.prepare('SELECT * FROM contact_forms ORDER BY created_at DESC LIMIT ?').all(limit)
        .map(row => ({ ...row, data: JSON.parse(row.data) }));
};

// ─── WA Accounts (persistent) ───────────────────────────────────────────────

const saveAccount = (id, label = '') => {
    const db = getDb();
    db.prepare(`
        INSERT OR IGNORE INTO wa_accounts (id, label, created_at)
        VALUES (?, ?, ?)
    `).run(id, label, new Date().toISOString());
};

const removeAccount = (id) => {
    const db = getDb();
    db.prepare('DELETE FROM wa_accounts WHERE id = ?').run(id);
};

const getSavedAccounts = () => {
    const db = getDb();
    return db.prepare('SELECT * FROM wa_accounts ORDER BY created_at ASC').all();
};

module.exports = {
    getDb,
    saveMessage,
    getMessages,
    getMessageById,
    getSession,
    upsertSession,
    deleteSession,
    getAllSessions,
    saveContactForm,
    getForms,
    saveAccount,
    removeAccount,
    getSavedAccounts,
};
