const sharedTranslationCache = require('../../../translation/cache/shared-translation-cache');

const V2_TRANSLATION_TTL_MS = 30 * 60 * 1000;
const v2TranslationCache = new Map();

function getV2TranslationCacheKey(tweetId, provider = 'unknown') {
    return `${tweetId}_${provider || 'unknown'}`;
}

function getCachedV2Translation(tweetId, provider = null) {
    if (provider) {
        const providerCached = v2TranslationCache.get(getV2TranslationCacheKey(tweetId, provider));
        if (providerCached) return providerCached;

        const sharedCached = sharedTranslationCache.get(tweetId, provider);
        if (sharedCached?.translated) {
            return {
                translatedText: sharedCached.translated.main || '',
                translatedQuoteText: sharedCached.translated.quote || '',
                translatedReplyText: sharedCached.translated.reply || ''
            };
        }
    }
    return v2TranslationCache.get(tweetId);
}

function setCachedV2Translation(tweetId, provider, translationData) {
    const providerKey = getV2TranslationCacheKey(tweetId, provider);
    v2TranslationCache.set(providerKey, translationData);
    v2TranslationCache.set(tweetId, translationData);

    setTimeout(() => {
        v2TranslationCache.delete(providerKey);
        v2TranslationCache.delete(tweetId);
    }, V2_TRANSLATION_TTL_MS);
}

module.exports = {
    getCachedV2Translation,
    setCachedV2Translation
};
