const logger = require('../utils/logger');
const {
    saveAutoReplyRule,
    listAutoReplyRules,
    updateAutoReplyRule,
    deleteAutoReplyRule,
} = require('../utils/database');

const toLegacyRule = (rule) => ({
    ...rule,
    accountId: rule.account_id,
    matchType: rule.match_type,
    createdAt: rule.created_at,
    updatedAt: rule.updated_at,
});

const addRule = (keyword, reply, matchType = 'contains', options = {}) => {
    const rule = saveAutoReplyRule({
        account_id: options.accountId || options.account_id || '*',
        keyword: String(keyword || '').trim(),
        reply: String(reply || '').trim(),
        match_type: matchType,
        enabled: options.enabled !== false,
        priority: options.priority ?? 100,
    });
    logger.info(`[AutoReply] Rule ${rule.id} added: "${keyword}" -> "${reply}" (${matchType})`);
    return toLegacyRule(rule);
};

const getAllRules = (accountId = null) => listAutoReplyRules(accountId).map(toLegacyRule);

const deleteRule = (id) => {
    const rule = deleteAutoReplyRule(id);
    if (!rule) return null;
    logger.info(`[AutoReply] Rule ${id} deleted`);
    return toLegacyRule(rule);
};

const updateRule = (id, changes) => {
    const payload = {
        account_id: changes.accountId ?? changes.account_id,
        keyword: changes.keyword,
        reply: changes.reply,
        match_type: changes.matchType ?? changes.match_type,
        enabled: changes.enabled,
        priority: changes.priority,
    };
    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    const rule = updateAutoReplyRule(id, payload);
    return rule ? toLegacyRule(rule) : null;
};

const toggleRule = (id, enabled) => updateRule(id, { enabled });

const findReply = (messageBody, accountId = null) => {
    const body = String(messageBody || '').trim();
    const lowerBody = body.toLowerCase();

    for (const rule of listAutoReplyRules(accountId)) {
        if (!rule.enabled) continue;
        const keyword = String(rule.keyword || '').trim();
        const lowerKeyword = keyword.toLowerCase();
        let matched = false;

        switch (rule.match_type) {
            case 'exact':
                matched = lowerBody === lowerKeyword;
                break;
            case 'startsWith':
                matched = lowerBody.startsWith(lowerKeyword);
                break;
            case 'endsWith':
                matched = lowerBody.endsWith(lowerKeyword);
                break;
            case 'regex':
                try {
                    matched = new RegExp(keyword, 'i').test(body);
                } catch (_) {
                    matched = false;
                }
                break;
            case 'contains':
            default:
                matched = lowerBody.includes(lowerKeyword);
        }

        if (matched) return rule.reply;
    }

    return null;
};

module.exports = { addRule, getAllRules, deleteRule, updateRule, toggleRule, findReply };
