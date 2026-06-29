const { getAiConfig, updateAiConfig, generateAiReply } = require('../../src/services/ai.service');

// Mock dependensi
jest.mock('openai', () => {
    return {
        OpenAI: jest.fn().mockImplementation((config) => {
            return {
                _config: config,
                chat: {
                    completions: {
                        create: jest.fn().mockImplementation((args) => {
                            if (args.model === 'error-model') {
                                return Promise.reject(new Error('Simulated OpenAI Error'));
                            }
                            return Promise.resolve({
                                choices: [{
                                    message: { content: `Mock Reply for ${args.messages[1].content}` }
                                }]
                            });
                        })
                    }
                }
            };
        })
    };
});

describe('AI Service', () => {
    const accountId = 'test-account';

    beforeEach(() => {
        // Reset config per account every test
        updateAiConfig(accountId, { 
            enabled: false, 
            systemPrompt: 'Default prompt',
            aiProvider: 'openai',
            aiBaseUrl: 'https://api.openai.com/v1',
            aiApiKey: 'test-api-key',
            aiModel: 'gpt-3.5-turbo'
        });
    });

    test('should return default config if not modified', () => {
        const config = getAiConfig('new-account');
        expect(config.enabled).toBe(false);
        expect(config.systemPrompt).toBe('Kamu adalah asisten profesional yang siap membantu.');
        // Defaults to env variables in real implementation, which are undefined here if not set,
        // but lets just ensure it doesn't crash
        expect(config).toHaveProperty('aiModel');
    });

    test('should update config correctly', () => {
        const result = updateAiConfig(accountId, {
            enabled: true,
            aiBaseUrl: 'http://localhost:11434/v1',
            aiModel: 'llama3'
        });
        
        expect(result.enabled).toBe(true);
        expect(result.aiBaseUrl).toBe('http://localhost:11434/v1');
        expect(result.aiModel).toBe('llama3');
        expect(result.systemPrompt).toBe('Default prompt'); // Unchanged
    });

    test('should not generate reply if disabled', async () => {
        updateAiConfig(accountId, { enabled: false });
        const reply = await generateAiReply(accountId, 'Hello');
        expect(reply).toBeNull();
    });

    test('should not generate reply if api key is missing', async () => {
        updateAiConfig(accountId, { enabled: true, aiApiKey: '' });
        const reply = await generateAiReply(accountId, 'Hello');
        expect(reply).toBeNull();
    });

    test('should generate reply successfully with custom endpoint config', async () => {
        updateAiConfig(accountId, { 
            enabled: true, 
            aiApiKey: 'ollama',
            aiBaseUrl: 'http://custom:11434/v1',
            aiModel: 'custom-model'
        });
        
        const reply = await generateAiReply(accountId, 'Hello Custom');
        expect(reply).toBe('Mock Reply for Hello Custom');
    });

    test('should handle API errors gracefully and return null', async () => {
        updateAiConfig(accountId, { 
            enabled: true, 
            aiApiKey: 'valid',
            aiModel: 'error-model'
        });
        
        const reply = await generateAiReply(accountId, 'Crash it');
        expect(reply).toBeNull();
    });
});
