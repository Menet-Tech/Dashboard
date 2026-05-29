const { addRule, getAllRules, deleteRule, toggleRule } = require('../services/autoReply.service');

const createRule = (req, res, next) => {
    try {
        const { keyword, reply, matchType } = req.body;
        if (!keyword || !reply) {
            return res.status(400).json({ status: 'error', message: 'Field keyword dan reply wajib diisi' });
        }
        const validTypes = ['exact', 'contains', 'startsWith'];
        if (matchType && !validTypes.includes(matchType)) {
            return res.status(400).json({ status: 'error', message: `matchType harus salah satu dari: ${validTypes.join(', ')}` });
        }
        const rule = addRule(keyword, reply, matchType || 'contains');
        res.json({ status: 'success', message: 'Rule auto-reply ditambahkan', data: rule });
    } catch (err) {
        next(err);
    }
};

const listRules = (req, res) => {
    res.json({ status: 'success', count: getAllRules().length, data: getAllRules() });
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
        const { enabled } = req.body;
        const result = toggleRule(req.params.id, !!enabled);
        if (!result) return res.status(404).json({ status: 'error', message: 'Rule tidak ditemukan' });
        res.json({ status: 'success', message: `Rule ${enabled ? 'diaktifkan' : 'dinonaktifkan'}`, data: result });
    } catch (err) {
        next(err);
    }
};

module.exports = { createRule, listRules, removeRule, patchRule };
