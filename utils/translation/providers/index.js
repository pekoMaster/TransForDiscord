const PROVIDERS = {
    free: { name: '免費翻譯', requiresKey: false },
    gemini: { name: 'Gemini', requiresKey: true },
    openrouter: { name: 'OpenRouter', requiresKey: true },
    openai: { name: 'GPT', requiresKey: true },
    claude: { name: 'Claude', requiresKey: true }
};

function isSupportedProvider(provider) {
    return Object.prototype.hasOwnProperty.call(PROVIDERS, provider);
}

module.exports = {
    PROVIDERS,
    isSupportedProvider
};
