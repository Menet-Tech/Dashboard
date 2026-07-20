const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let db;

const resolveDatabasePath = () => {
    if (process.env.WA_DB_PATH && process.env.WA_DB_PATH.trim()) {
        const customPath = process.env.WA_DB_PATH.trim();
        if (path.isAbsolute(customPath)) {
            return path.resolve(customPath);
        }
        return path.resolve(__dirname, '../../', customPath);
    }
    const storagePath = path.resolve(__dirname, '../../storage/wa_gateway.db');
    const legacyPath = path.resolve(__dirname, '../../wa_gateway.db');
    if (!fs.existsSync(storagePath) && fs.existsSync(legacyPath)) {
        return legacyPath;
    }
    return storagePath;
};

const getDb = () => {
    if (!db) {
        const Database = require('better-sqlite3');
        const databasePath = resolveDatabasePath();
        fs.mkdirSync(path.dirname(databasePath), { recursive: true });
        db = new Database(databasePath);
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
        try { db.exec("ALTER TABLE messages ADD COLUMN idempotency_key TEXT"); } catch (e) {}

        // Migration: Tambah kolom image_path untuk auto_reply_rules
        try { db.exec("ALTER TABLE auto_reply_rules ADD COLUMN image_path TEXT"); } catch (e) {}

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

        db.exec(`
            CREATE TABLE IF NOT EXISTS auto_reply_rules (
                id          TEXT PRIMARY KEY,
                account_id  TEXT NOT NULL DEFAULT '*',
                keyword     TEXT NOT NULL,
                reply       TEXT NOT NULL,
                match_type  TEXT NOT NULL DEFAULT 'contains',
                enabled     INTEGER NOT NULL DEFAULT 1,
                priority    INTEGER NOT NULL DEFAULT 100,
                image_path  TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS gateway_settings (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL DEFAULT '',
                updated_at  TEXT NOT NULL
            );
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS scheduled_messages (
                id           TEXT PRIMARY KEY,
                account_id   TEXT NOT NULL DEFAULT 'default',
                to_number    TEXT NOT NULL,
                text         TEXT NOT NULL,
                type         TEXT NOT NULL DEFAULT 'once',
                scheduled_at TEXT,
                day          INTEGER,
                time         TEXT,
                cron_expr    TEXT NOT NULL,
                description  TEXT NOT NULL DEFAULT '',
                status       TEXT NOT NULL DEFAULT 'pending',
                last_sent_at TEXT,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );
        `);

        logger.info(`[DB] SQLite database initialized: ${databasePath}`);
    }
    return db;
};

/**
 * Simpan pesan terkirim/masuk ke database
 */
const saveMessage = (to, body, type = 'text', waMessageId = null, direction = 'outbound', fromNumber = null, accountId = 'default', idempotencyKey = null) => {
    const db = getDb();
    const id = require('crypto').randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    const stmt = db.prepare(`
        INSERT INTO messages (id, to_number, body, type, status, wa_message_id, created_at, sent_at, direction, from_number, account_id, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const status = direction === 'inbound' ? 'received' : 'sent';
    stmt.run(id, to, body, type, status, waMessageId, now, now, direction, fromNumber, accountId, idempotencyKey || null);
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

const getLastOutboundMessage = (toNumber) => {
    const db = getDb();
    const cleanNum = toNumber.replace(/@(c\.us|lid)$/, '').replace(/[+\-\s]/g, '').replace(/^0/, '62');
    return db.prepare(`
        SELECT * FROM messages
        WHERE (to_number = ? OR to_number LIKE ? OR to_number = ? OR to_number LIKE ?) AND direction = 'outbound'
        ORDER BY created_at DESC
        LIMIT 1
    `).get(cleanNum, `%${cleanNum}%`, toNumber, `%${toNumber}%`);
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

const saveAutoReplyRule = (rule) => {
    const db = getDb();
    const id = rule.id || require('crypto').randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO auto_reply_rules (id, account_id, keyword, reply, match_type, enabled, priority, image_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        rule.account_id || '*',
        rule.keyword,
        rule.reply,
        rule.match_type || 'contains',
        rule.enabled === false ? 0 : 1,
        Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 100,
        rule.image_path || null,
        now,
        now
    );
    return getAutoReplyRule(id);
};

const listAutoReplyRules = (accountId = null) => {
    const db = getDb();
    const rows = accountId
        ? db.prepare(`
            SELECT *
            FROM auto_reply_rules
            WHERE account_id IN ('*', ?)
            ORDER BY
                CASE WHEN account_id = ? THEN 0 ELSE 1 END,
                priority ASC,
                created_at ASC
        `).all(accountId, accountId)
        : db.prepare('SELECT * FROM auto_reply_rules ORDER BY priority ASC, created_at ASC').all();
    return rows.map(normalizeAutoReplyRule);
};

const getAutoReplyRule = (id) => {
    const row = getDb().prepare('SELECT * FROM auto_reply_rules WHERE id = ?').get(id);
    return row ? normalizeAutoReplyRule(row) : null;
};

const updateAutoReplyRule = (id, changes) => {
    const current = getAutoReplyRule(id);
    if (!current) return null;
    const next = { ...current, ...changes };
    getDb().prepare(`
        UPDATE auto_reply_rules
        SET account_id = ?, keyword = ?, reply = ?, match_type = ?, enabled = ?, priority = ?, image_path = ?, updated_at = ?
        WHERE id = ?
    `).run(
        next.account_id || '*',
        next.keyword,
        next.reply,
        next.match_type || 'contains',
        next.enabled === false ? 0 : 1,
        Number.isFinite(Number(next.priority)) ? Number(next.priority) : 100,
        next.image_path || null,
        new Date().toISOString(),
        id
    );
    return getAutoReplyRule(id);
};

const deleteAutoReplyRule = (id) => {
    const current = getAutoReplyRule(id);
    if (!current) return null;
    getDb().prepare('DELETE FROM auto_reply_rules WHERE id = ?').run(id);
    return current;
};

const normalizeAutoReplyRule = (row) => ({
    ...row,
    enabled: !!row.enabled,
    priority: Number(row.priority) || 100,
    image_path: row.image_path || null,
});

const getGatewaySetting = (key, fallback = '') => {
    const row = getDb().prepare('SELECT value FROM gateway_settings WHERE key = ?').get(key);
    return row ? row.value : fallback;
};

const setGatewaySetting = (key, value) => {
    getDb().prepare(`
        INSERT INTO gateway_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value ?? '', new Date().toISOString());
    return { key, value: value ?? '' };
};

const getGatewaySettings = () => {
    const rows = getDb().prepare('SELECT key, value FROM gateway_settings ORDER BY key ASC').all();
    return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
};

const normalizeScheduledMessage = (row) => ({
    id: row.id,
    accountId: row.account_id,
    to: row.to_number,
    text: row.text,
    type: row.type,
    scheduledAt: row.scheduled_at,
    day: row.day,
    time: row.time,
    cronExpr: row.cron_expr,
    description: row.description,
    status: row.status,
    lastSentAt: row.last_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const getScheduledMessage = (id) => {
    const row = getDb().prepare('SELECT * FROM scheduled_messages WHERE id = ?').get(id);
    return row ? normalizeScheduledMessage(row) : null;
};

const saveScheduledMessage = (entry) => {
    const now = new Date().toISOString();
    getDb().prepare(`
        INSERT INTO scheduled_messages (
            id, account_id, to_number, text, type, scheduled_at, day, time,
            cron_expr, description, status, last_sent_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        entry.id,
        entry.accountId || 'default',
        entry.to,
        entry.text,
        entry.type || 'once',
        entry.scheduledAt || null,
        entry.day || null,
        entry.time || null,
        entry.cronExpr,
        entry.description || '',
        entry.status || 'pending',
        entry.lastSentAt || null,
        entry.createdAt || now,
        now
    );
    return getScheduledMessage(entry.id);
};

const updateScheduledMessage = (id, changes = {}) => {
    const current = getScheduledMessage(id);
    if (!current) return null;
    const next = { ...current, ...changes };
    getDb().prepare(`
        UPDATE scheduled_messages
        SET account_id = ?, to_number = ?, text = ?, type = ?, scheduled_at = ?,
            day = ?, time = ?, cron_expr = ?, description = ?, status = ?,
            last_sent_at = ?, updated_at = ?
        WHERE id = ?
    `).run(
        next.accountId || 'default',
        next.to,
        next.text,
        next.type || 'once',
        next.scheduledAt || null,
        next.day || null,
        next.time || null,
        next.cronExpr,
        next.description || '',
        next.status || 'pending',
        next.lastSentAt || null,
        new Date().toISOString(),
        id
    );
    return getScheduledMessage(id);
};

const listScheduledMessages = () => {
    return getDb().prepare(`
        SELECT *
        FROM scheduled_messages
        ORDER BY created_at DESC
    `).all().map(normalizeScheduledMessage);
};

const listActiveScheduledMessages = () => {
    return getDb().prepare(`
        SELECT *
        FROM scheduled_messages
        WHERE status IN ('active', 'pending', 'failed')
        ORDER BY created_at ASC
    `).all().map(normalizeScheduledMessage);
};

const updateFormStatus = (id, status) => {
    const db = getDb();
    db.prepare('UPDATE contact_forms SET status = ? WHERE id = ?').run(status, id);
    const row = db.prepare('SELECT * FROM contact_forms WHERE id = ?').get(id);
    if (row) {
        row.data = JSON.parse(row.data);
    }
    return row;
};

const deleteForm = (id) => {
    const db = getDb();
    db.prepare('DELETE FROM contact_forms WHERE id = ?').run(id);
};

module.exports = {
    getDb,
    resolveDatabasePath,
    saveMessage,
    getMessages,
    getMessageById,
    getLastOutboundMessage,
    getSession,
    upsertSession,
    deleteSession,
    getAllSessions,
    saveContactForm,
    getForms,
    updateFormStatus,
    deleteForm,
    saveAccount,
    removeAccount,
    getSavedAccounts,
    saveAutoReplyRule,
    listAutoReplyRules,
    getAutoReplyRule,
    updateAutoReplyRule,
    deleteAutoReplyRule,
    getGatewaySetting,
    setGatewaySetting,
    getGatewaySettings,
    saveScheduledMessage,
    updateScheduledMessage,
    getScheduledMessage,
    listScheduledMessages,
    listActiveScheduledMessages,
};
