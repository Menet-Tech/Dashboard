const { addRule, getAllRules, deleteRule, updateRule, toggleRule } = require('../services/autoReply.service');

const validTypes = ['exact', 'contains', 'startsWith', 'endsWith', 'regex'];

const createRule = (req, res, next) => {
    try {
        const { keyword, reply, matchType, accountId, enabled, priority } = req.body;
        if (!keyword || !reply) {
            return res.status(400).json({ status: 'error', message: 'Field keyword dan reply wajib diisi' });
        }
        if (matchType && !validTypes.includes(matchType)) {
            return res.status(400).json({ status: 'error', message: `matchType harus salah satu dari: ${validTypes.join(', ')}` });
        }
        const rule = addRule(keyword, reply, matchType || 'contains', { accountId, enabled, priority });
        res.json({ status: 'success', message: 'Rule auto-reply ditambahkan', data: rule });
    } catch (err) {
        next(err);
    }
};

const listRules = (req, res) => {
    const rules = getAllRules(req.query.accountId || null);
    res.json({ status: 'success', count: rules.length, data: rules });
};

const removeRule = (req, res, next) => {
    try {
        const result = deleteRule(req.params.id);
        if (!result) return res.status(404).json({ status: 'error', message: 'Rule tidak ditemukan' });
        res.json({ status: 'success', message: 'Rule dihapus', data: result });
    } catch (err) {
        next(err);
    }
};

const patchRule = (req, res, next) => {
    try {
        const { enabled, ...changes } = req.body;
        if (changes.matchType && !validTypes.includes(changes.matchType)) {
            return res.status(400).json({ status: 'error', message: `matchType harus salah satu dari: ${validTypes.join(', ')}` });
        }
        const result = Object.keys(changes).length > 0
            ? updateRule(req.params.id, { ...changes, enabled })
            : toggleRule(req.params.id, !!enabled);
        if (!result) return res.status(404).json({ status: 'error', message: 'Rule tidak ditemukan' });
        res.json({ status: 'success', message: 'Rule auto-reply diperbarui', data: result });
    } catch (err) {
        next(err);
    }
};

module.exports = { createRule, listRules, removeRule, patchRule };
