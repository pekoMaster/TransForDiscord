const { deriveStateFromComponents } = require('../../state/v2-component-state');
const { extractMarkerTextFromMessage } = require('./shared');
const { getCachedV2Translation } = require('./translation-cache');

function buildFallbackState(interaction, tweetId, cached = null) {
    const derived = deriveStateFromComponents(interaction.message.components, tweetId);
    const cachedTranslation = getCachedV2Translation(tweetId);

    return {
        tweetId,
        originalURL: cached?.originalURL || `https://twitter.com/i/status/${tweetId}`,
        markerText: extractMarkerTextFromMessage(interaction.message),
        isTranslated: Boolean(derived.isTranslated && cachedTranslation),
        translatedText: cachedTranslation?.translatedText || null,
        translatedQuoteText: cachedTranslation?.translatedQuoteText || null,
        translatedReplyText: cachedTranslation?.translatedReplyText || null,
        isExpanded: Boolean(derived.isExpanded),
        isQuoteShown: Boolean(derived.isQuoteShown),
        isReplyShown: Boolean(derived.isReplyShown)
    };
}

function resolveRenderState({
    interaction,
    tweetId,
    cached,
    storedState = null,
    stateOverrides = {}
}) {
    const baseState = storedState || buildFallbackState(interaction, tweetId, cached);

    return {
        ...baseState,
        ...stateOverrides,
        tweetId,
        originalURL: cached?.originalURL || baseState.originalURL || `https://twitter.com/i/status/${tweetId}`,
        markerText: stateOverrides.markerText !== undefined
            ? stateOverrides.markerText
            : baseState.markerText
    };
}

module.exports = {
    buildFallbackState,
    resolveRenderState
};
