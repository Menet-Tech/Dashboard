const { getAiConfig, updateAiConfig } = require('../services/ai.service');

const getAiSettings = (req, res, next) => {
    try {
        const config = getAiConfig(req.accountId);
        res.json({ status: 'success', data: config });
    } catch (err) {
        next(err);
    }
};

const updateAiSettings = (req, res, next) => {
    try {
        const { enabled, systemPrompt, aiProvider, aiBaseUrl, aiApiKey, aiModel } = req.body;
        const result = updateAiConfig(req.accountId, {
            enabled, systemPrompt, aiProvider, aiBaseUrl, aiApiKey, aiModel
        });
        res.json({ status: 'success', message: 'AI settings updated', data: result });
    } catch (err) {
        next(err);
    }
};

module.exports = { getAiSettings, updateAiSettings };
