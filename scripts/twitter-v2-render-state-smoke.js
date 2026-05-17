const assert = require('node:assert/strict');

const {
    buildFallbackState,
    resolveRenderState
} = require('../src/features/twitter/interactions/v2/render-state');
const { setCachedV2Translation } = require('../src/features/twitter/interactions/v2/translation-cache');

function row(ids) {
    return {
        components: ids.map(id => ({ customId: id }))
    };
}

function interactionFor(message) {
    return { message };
}

setCachedV2Translation('100', 'gemini', {
    translatedText: 'translated main',
    translatedQuoteText: 'translated quote',
    translatedReplyText: 'translated reply'
});

const translatedFallback = buildFallbackState(interactionFor({
    content: '-# <@123> via Peko Embed\nbody',
    components: [row(['v2_original_100', 'v2_collapse_all_100'])]
}), '100', {
    originalURL: 'https://twitter.com/tester/status/100'
});

assert.deepEqual(translatedFallback, {
    tweetId: '100',
    originalURL: 'https://twitter.com/tester/status/100',
    markerText: '-# <@123> via Peko Embed',
    isTranslated: true,
    translatedText: 'translated main',
    translatedQuoteText: 'translated quote',
    translatedReplyText: 'translated reply',
    isExpanded: true,
    isQuoteShown: true,
    isReplyShown: true
});

const untranslatedFallback = buildFallbackState(interactionFor({
    components: [row(['v2_expand_all_200'])]
}), '200');

assert.deepEqual(untranslatedFallback, {
    tweetId: '200',
    originalURL: 'https://twitter.com/i/status/200',
    markerText: null,
    isTranslated: false,
    translatedText: null,
    translatedQuoteText: null,
    translatedReplyText: null,
    isExpanded: false,
    isQuoteShown: false,
    isReplyShown: false
});

const resolved = resolveRenderState({
    interaction: interactionFor({
        content: '-# <@999> fallback marker',
        components: [row(['v2_collapse_all_100'])]
    }),
    tweetId: '100',
    cached: {
        originalURL: 'https://x.com/tester/status/100'
    },
    storedState: {
        tweetId: '100',
        originalURL: 'https://twitter.com/old/status/100',
        markerText: '-# stored marker',
        isTranslated: false,
        translatedText: null,
        translatedQuoteText: null,
        translatedReplyText: null,
        isExpanded: false,
        isQuoteShown: false,
        isReplyShown: false
    },
    stateOverrides: {
        isExpanded: true
    }
});

assert.equal(resolved.originalURL, 'https://x.com/tester/status/100');
assert.equal(resolved.markerText, '-# stored marker');
assert.equal(resolved.isTranslated, false);
assert.equal(resolved.isExpanded, true);
assert.equal(resolved.isQuoteShown, false);
assert.equal(resolved.isReplyShown, false);

const markerCleared = resolveRenderState({
    interaction: interactionFor({ components: [] }),
    tweetId: '100',
    cached: { originalURL: 'https://x.com/tester/status/100' },
    storedState: resolved,
    stateOverrides: { markerText: null }
});

assert.equal(markerCleared.markerText, null);

console.log('twitter v2 render state smoke ok');
process.exit(0);
