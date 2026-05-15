const { buildPrompt } = require('../text/prompt-builder');
const { splitTranslatedBundle } = require('../text/text-bundle');
const { resolveTranslationKey } = require('../keys/key-resolver');
const { failure } = require('../errors');

const providers = {
    gemini: require('../../../../utils/translation/providers/gemini'),
    openrouter: require('../../../../utils/translation/providers/openrouter'),
    openai: require('../../../../utils/translation/providers/openai'),
    claude: require('../../../../utils/translation/providers/claude')
};

async function translateTweet({
    textBundle,
    userId,
    provider = null,
    authorName = null,
    context = '',
    allowEnvFallback = false
} = {}) {
    if (!textBundle?.combined?.trim()) {
        return {
            success: true,
            provider: provider || 'none',
            model: 'none',
            translated: { main: '', quote: '', reply: '' },
            error: null,
            errorType: null
        };
    }

    const keyResult = resolveTranslationKey({ userId, provider, allowEnvFallback });
    if (!keyResult.success) return keyResult;

    if (keyResult.provider === 'free') {
        return failure('FREE_NOT_READY');
    }

    const providerImpl = providers[keyResult.provider];
    if (!providerImpl) return failure('NO_PROVIDER_SELECTED');

    const prompt = buildPrompt({ authorName, context });
    const result = await providerImpl.translate({
        text: textBundle.combined,
        apiKey: keyResult.apiKey,
        prompt
    });

    if (!result.success) return result;

    return {
        success: true,
        provider: keyResult.provider,
        model: result.model,
        translated: splitTranslatedBundle(result.text),
        error: null,
        errorType: null
    };
}

module.exports = {
    translateTweet
};
