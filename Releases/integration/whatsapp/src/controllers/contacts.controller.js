const { getContacts, getContactById, getProfilePicUrl, isRegisteredUser } = require('../services/whatsapp.service');

const getAllContacts = async (req, res, next) => {
    try {
        const contacts = await getContacts(req.accountId);
        res.json({ status: 'success', data: contacts.map(c => ({ id: c.id._serialized, name: c.name, number: c.number })) });
    } catch (err) {
        next(err);
    }
};

const getContactDetail = async (req, res, next) => {
    try {
        const contact = await getContactById(req.accountId, req.params.number);
        res.json({ status: 'success', data: contact });
    } catch (err) {
        next(err);
    }
};

const getContactProfilePic = async (req, res, next) => {
    try {
        const url = await getProfilePicUrl(req.accountId, req.params.number);
        if (!url) {
            return res.status(404).json({ status: 'error', message: 'Profile picture not found' });
        }
        res.json({ status: 'success', data: { url } });
    } catch (err) {
        next(err);
    }
};

const checkIsRegistered = async (req, res, next) => {
    try {
        const registered = await isRegisteredUser(req.accountId, req.params.number);
        res.json({ status: 'success', data: { registered } });
    } catch (err) {
        next(err);
    }
};

module.exports = { getAllContacts, getContactDetail, getContactProfilePic, checkIsRegistered };
