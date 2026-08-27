const { getTemplateByTrigger, getAllTemplates } = require('../isp.service');
const { renderTemplate } = require('./utils');

/**
 * Mendapatkan template dari DB atau fallback jika tidak ada.
 */
const getTemplate = async (triggerKey, variables = {}, fallbackText = '') => {
    try {
        const tpl = await getTemplateByTrigger(triggerKey);
        if (tpl && tpl.is_active) {
            return renderTemplate(tpl.content || tpl.isi_template, variables);
        }
    } catch (err) {
        console.error(`[Chatbot Templates] Error getting template ${triggerKey}:`, err.message);
    }
    return renderTemplate(fallbackText, variables);
};

const getTriggers = async () => {
    const allTemplates = await getAllTemplates();
    const findTriggerKeywords = (key, defaultVal) => {
        const found = allTemplates.find(t => t.trigger_key === key && t.is_active);
        return found ? (found.trigger_keywords || defaultVal) : defaultVal;
    };

    return {
        allTemplates,
        triggerBilling: findTriggerKeywords('chatbot_trigger_billing', '1'),
        triggerRegister: findTriggerKeywords('chatbot_trigger_register', '1'),
        triggerSupport: findTriggerKeywords('chatbot_trigger_support', '2'),
        triggerPackages: findTriggerKeywords('chatbot_trigger_packages', '3'),
        triggerFAQ: findTriggerKeywords('chatbot_trigger_faq', '4'),
        triggerAdmin: findTriggerKeywords('chatbot_trigger_admin', '5'),
    };
};

module.exports = {
    getTemplate,
    getTriggers,
};
