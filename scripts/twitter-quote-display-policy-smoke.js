const assert = require('node:assert/strict');

const {
    getQuoteDisplayPolicy,
    shouldTransitionV1QuoteToV2,
    shouldTransitionV2QuoteToV1
} = require('../src/features/twitter/extractors/v2/quote-display-policy');

function policy(input) {
    return getQuoteDisplayPolicy({
        isQuote: true,
        hasQuoteTweet: true,
        ...input
    });
}

const v1Expanded = policy({ quoterHasImages: false, quotedHasVideo: false });
assert.equal(v1Expanded.initialRenderer, 'v1');
assert.equal(v1Expanded.shouldAutoExpandQuote, true);
assert.equal(v1Expanded.shouldUseV2ForQuote, false);
assert.equal(v1Expanded.shouldTransitionExpandToV2, false);
assert.equal(v1Expanded.shouldTransitionCollapseToV1, false);

const v1Collapsed = policy({ quoterHasImages: true, quotedHasVideo: false });
assert.equal(v1Collapsed.initialRenderer, 'v1');
assert.equal(v1Collapsed.shouldAutoExpandQuote, false);
assert.equal(v1Collapsed.shouldUseV2ForQuote, false);
assert.equal(v1Collapsed.shouldTransitionExpandToV2, false);
assert.equal(v1Collapsed.shouldTransitionCollapseToV1, false);

const v2Expanded = policy({ quoterHasImages: false, quotedHasVideo: true });
assert.equal(v2Expanded.initialRenderer, 'v2');
assert.equal(v2Expanded.shouldAutoExpandQuote, true);
assert.equal(v2Expanded.shouldUseV2ForQuote, true);
assert.equal(v2Expanded.shouldTransitionExpandToV2, false);
assert.equal(v2Expanded.shouldTransitionCollapseToV1, true);

const v1CollapsedWithTransition = policy({ quoterHasImages: true, quotedHasVideo: true });
assert.equal(v1CollapsedWithTransition.initialRenderer, 'v1');
assert.equal(v1CollapsedWithTransition.shouldAutoExpandQuote, false);
assert.equal(v1CollapsedWithTransition.shouldUseV2ForQuote, false);
assert.equal(v1CollapsedWithTransition.shouldTransitionExpandToV2, true);
assert.equal(v1CollapsedWithTransition.shouldTransitionCollapseToV1, true);

assert.equal(shouldTransitionV1QuoteToV2({ quoterHasImages: true, quotedHasVideo: true }), true);
assert.equal(shouldTransitionV1QuoteToV2({ quoterHasImages: false, quotedHasVideo: true }), false);
assert.equal(shouldTransitionV2QuoteToV1({ quotedHasVideo: true }), true);
assert.equal(shouldTransitionV2QuoteToV1({ quotedHasVideo: false }), false);

const notQuote = getQuoteDisplayPolicy({ isQuote: false, hasQuoteTweet: false });
assert.equal(notQuote.initialRenderer, 'v1');
assert.equal(notQuote.shouldAutoExpandQuote, false);
assert.equal(notQuote.shouldUseV2ForQuote, false);

console.log('twitter quote display policy smoke ok');
