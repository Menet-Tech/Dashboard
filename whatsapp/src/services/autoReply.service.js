const logger = require('../utils/logger');

// Map: id -> { id, keyword, reply, matchType, enabled }
const rules = new Map();

/**
 * Tambah rule auto-reply baru
 * @param {string} keyword - kata kunci yang dicari
 * @param {string} reply - balasan otomatis
 * @param {'exact'|'contains'|'startsWith'} matchType
 */
const addRule = (keyword, reply, matchType = 'contains') => {
    const id = require('crypto').randomBytes(6).toString('hex');
    const rule = { id, keyword: keyword.toLowerCase(), reply, matchType, enabled: true, createdAt: new Date().toISOString() };
    rules.set(id, rule);
    logger.info(`[AutoReply] Rule ${id} added: "${keyword}" → "${reply}" (${matchType})`);
    return rule;
};

const getAllRules = () => [...rules.values()];

const deleteRule = (id) => {
    if (!rules.has(id)) return null;
    const rule = rules.get(id);
    rules.delete(id);
    logger.info(`[AutoReply] Rule ${id} deleted`);
    return rule;
};

const toggleRule = (id, enabled) => {
    const rule = rules.get(id);
    if (!rule) return null;
    rule.enabled = enabled;
    return rule;
};

/**
 * Cek apakah ada rule yang cocok dengan pesan masuk, return balasan atau null
 * @param {string} messageBody - isi pesan masuk (case-insensitive)
 */
const findReply = (messageBody) => {
    const body = messageBody.toLowerCase().trim();
    for (const rule of rules.values()) {
        if (!rule.enabled) continue;
        let matched = false;
        switch (rule.matchType) {
            case 'exact':
                matched = body === rule.keyword;
                break;
            case 'startsWith':
                matched = body.startsWith(rule.keyword);
                break;
            case 'contains':
            default:
                matched = body.includes(rule.keyword);
        }
        if (matched) return rule.reply;
    }
    return null;
};

module.exports = { addRule, getAllRules, deleteRule, toggleRule, findReply };
