const { buildPrompt } = require('../text/prompt-builder');
const { splitTranslatedBundle } = require('../text/text-bundle');
const { resolveTranslationKey } = require('../keys/key-resolver');
const { failure } = require('../errors');
const OpenCC = require('opencc-js');

// 簡體轉繁體轉換器（簡體 → 繁體）
const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

const providers = {
    free: require('../providers/free-provider'),
    gemini: require('../providers/gemini-provider'),
    openrouter: require('../providers/openrouter-provider'),
    openai: require('../providers/openai-provider'),
    claude: require('../providers/claude-provider')
};

/**
 * 後處理：確保翻譯結果為繁體中文
 * 使用 OpenCC 將簡體中文轉換為繁體中文
 */
function ensureTraditionalChinese(text) {
    if (!text) return text;
    return converter(text);
}

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

    const providerImpl = providers[keyResult.provider];
    if (!providerImpl) return failure('NO_PROVIDER_SELECTED');

    const prompt = buildPrompt({ authorName, context });
    const result = await providerImpl.translate({
        text: textBundle.combined,
        apiKey: keyResult.apiKey,
        prompt
    });

    if (!result.success) return result;

    // 後處理：確保翻譯結果為繁體中文
    const translatedText = ensureTraditionalChinese(result.text);

    return {
        success: true,
        provider: keyResult.provider,
        model: result.model,
        translated: splitTranslatedBundle(translatedText),
        error: null,
        errorType: null
    };
}

module.exports = {
    translateTweet
};
