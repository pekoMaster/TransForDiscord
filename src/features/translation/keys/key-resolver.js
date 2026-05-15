const { getKey, getPreferredProvider } = require('./user-api-key-storage');
const { PROVIDERS, isSupportedProvider } = require('../providers/provider-registry');
const { failure } = require('../errors');

const ENV_KEY_BY_PROVIDER = {
    gemini: [
        'GOOGLE_GEMINI_API_KEY_1',
        'GOOGLE_GEMINI_API_KEY_2',
        'GOOGLE_GEMINI_API_KEY_3',
        'GOOGLE_GEMINI_API_KEY_5',
        'GOOGLE_GEMINI_API_KEY_6'
    ],
    openrouter: ['OPENROUTER_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']
};

const envRoundRobin = new Map();

function getEnvFallbackKey(provider) {
    const names = ENV_KEY_BY_PROVIDER[provider] || [];
    const keys = names.map(name => process.env[name]).filter(Boolean);
    if (keys.length === 0) return null;

    const idx = envRoundRobin.get(provider) || 0;
    envRoundRobin.set(provider, (idx + 1) % keys.length);
    return keys[idx % keys.length];
}

function resolveTranslationKey({ userId, provider = null, allowEnvFallback = false } = {}) {
    const selectedProvider = provider || getPreferredProvider(userId);
    if (!selectedProvider || !isSupportedProvider(selectedProvider)) {
        return failure('NO_PROVIDER_SELECTED');
    }

    if (!PROVIDERS[selectedProvider].requiresKey) {
        return { success: true, provider: selectedProvider, apiKey: null, source: 'none' };
    }

    const userKey = userId ? getKey(userId, selectedProvider) : null;
    if (userKey) {
        return { success: true, provider: selectedProvider, apiKey: userKey, source: 'user' };
    }

    if (allowEnvFallback) {
        const envKey = getEnvFallbackKey(selectedProvider);
        if (envKey) {
            return { success: true, provider: selectedProvider, apiKey: envKey, source: 'env' };
        }
    }

    return failure('NO_API_KEY');
}

module.exports = {
    resolveTranslationKey,
    getEnvFallbackKey,
    ENV_KEY_BY_PROVIDER
};
