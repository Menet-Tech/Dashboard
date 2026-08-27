const { OpenAI } = require('openai');
const logger = require('../utils/logger');

// Map konfigurasi AI per accountId
const aiConfigs = new Map();

const getAiConfig = (accountId) => {
    if (!aiConfigs.has(accountId)) {
        aiConfigs.set(accountId, { 
            enabled: false, 
            systemPrompt: 'Kamu adalah asisten profesional yang siap membantu.',
            aiProvider: process.env.AI_PROVIDER || 'openai',
            aiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            aiApiKey: process.env.OPENAI_API_KEY || '',
            aiModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
        });
    }
    return aiConfigs.get(accountId);
};

const updateAiConfig = (accountId, data) => {
    const config = getAiConfig(accountId);
    if (data.enabled !== undefined) config.enabled = data.enabled;
    if (data.systemPrompt !== undefined) config.systemPrompt = data.systemPrompt;
    if (data.aiProvider !== undefined) config.aiProvider = data.aiProvider;
    if (data.aiBaseUrl !== undefined) config.aiBaseUrl = data.aiBaseUrl;
    if (data.aiApiKey !== undefined) config.aiApiKey = data.aiApiKey;
    if (data.aiModel !== undefined) config.aiModel = data.aiModel;
    aiConfigs.set(accountId, config);
    return config;
};

const generateAiReply = async (accountId, requestText) => {
    const config = getAiConfig(accountId);
    if (!config.enabled) return null; // AI tidak aktif untuk akun ini

    if (!config.aiApiKey) {
        logger.error(`[AI][${accountId}] API Key belum dikonfigurasi.`);
        return null;
    }

    try {
        const openai = new OpenAI({ 
            apiKey: config.aiApiKey,
            baseURL: config.aiBaseUrl
        });
        
        const response = await openai.chat.completions.create({
            model: config.aiModel || 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: config.systemPrompt },
                { role: 'user', content: requestText }
            ],
            max_tokens: 300,
            temperature: 0.7
        });

        const reply = response.choices[0]?.message?.content?.trim();
        logger.info(`[${accountId}][AI-Reply] Generated reply by ${config.aiModel} for: "${requestText}"`);
        return reply || null;
    } catch (err) {
        logger.error(`[AI][${accountId}] Gagal melakukan request ke OpenAI: ${err.message}`);
        return null; // Fallback ke null agar user tidak mendapat error mentah di WhatsApp
    }
};

module.exports = { getAiConfig, updateAiConfig, generateAiReply };
