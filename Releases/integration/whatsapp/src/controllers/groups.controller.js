const { createGroup, getChats, getChatById } = require('../services/whatsapp.service');

const postCreateGroup = async (req, res, next) => {
    try {
        const { title, participants } = req.body;
        const result = await createGroup(req.accountId, title, participants);
        res.json({ status: 'success', message: 'Group created', data: result });
    } catch (err) {
        next(err);
    }
};

const getGroups = async (req, res, next) => {
    try {
        const chats = await getChats(req.accountId);
        const groups = chats.filter(chat => chat.isGroup);
        res.json({ status: 'success', data: groups.map(g => ({ id: g.id._serialized, name: g.name })) });
    } catch (err) {
        next(err);
    }
};

const getGroupDetail = async (req, res, next) => {
    try {
        const chat = await getChatById(req.accountId, req.params.id);
        if (!chat || !chat.isGroup) {
            return res.status(404).json({ status: 'error', message: 'Group not found' });
        }
        res.json({ status: 'success', data: chat });
    } catch (err) {
        next(err);
    }
};

module.exports = { postCreateGroup, getGroups, getGroupDetail };
