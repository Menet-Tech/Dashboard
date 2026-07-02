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
        
        let isEnabled = true;
        if (enabled !== undefined) {
            isEnabled = enabled === 'true' || enabled === '1' || enabled === true;
        }
        
        const image_path = req.file ? req.file.filename : null;
        
        const rule = addRule(keyword, reply, matchType || 'contains', { 
            accountId, 
            enabled: isEnabled, 
            priority: priority !== undefined ? Number(priority) : 100,
            image_path
        });
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
        const { enabled, keyword, reply, matchType, accountId, priority } = req.body;
        if (matchType && !validTypes.includes(matchType)) {
            return res.status(400).json({ status: 'error', message: `matchType harus salah satu dari: ${validTypes.join(', ')}` });
        }
        
        const changes = {};
        if (keyword !== undefined) changes.keyword = keyword;
        if (reply !== undefined) changes.reply = reply;
        if (matchType !== undefined) changes.matchType = matchType;
        if (accountId !== undefined) changes.accountId = accountId;
        if (priority !== undefined) changes.priority = Number(priority);
        if (enabled !== undefined) {
            changes.enabled = enabled === 'true' || enabled === '1' || enabled === true;
        }
        if (req.file) {
            changes.image_path = req.file.filename;
        }

        const result = updateRule(req.params.id, changes);
        if (!result) return res.status(404).json({ status: 'error', message: 'Rule tidak ditemukan' });
        res.json({ status: 'success', message: 'Rule auto-reply diperbarui', data: result });
    } catch (err) {
        next(err);
    }
};

module.exports = { createRule, listRules, removeRule, patchRule };
