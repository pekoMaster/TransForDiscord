function getQuoteDisplayPolicy(input = {}) {
    const isQuote = Boolean(input.isQuote);
    const hasQuoteTweet = Boolean(input.hasQuoteTweet || input.quoteInfo?.tweet);
    const quoterHasImages = Boolean(input.quoterHasImages);
    const quotedHasVideo = Boolean(input.quotedHasVideo);

    if (!isQuote || !hasQuoteTweet) {
        return {
            initialRenderer: 'v1',
            shouldAutoExpandQuote: false,
            shouldUseV2ForQuote: false,
            shouldTransitionExpandToV2: false,
            shouldTransitionCollapseToV1: false
        };
    }

    const shouldUseV2ForQuote = !quoterHasImages && quotedHasVideo;
    const shouldAutoExpandQuote = !quoterHasImages;

    return {
        initialRenderer: shouldUseV2ForQuote ? 'v2' : 'v1',
        shouldAutoExpandQuote,
        shouldUseV2ForQuote,
        shouldTransitionExpandToV2: shouldTransitionV1QuoteToV2({ quoterHasImages, quotedHasVideo }),
        shouldTransitionCollapseToV1: shouldTransitionV2QuoteToV1({ quotedHasVideo })
    };
}

function shouldTransitionV1QuoteToV2(input = {}) {
    return Boolean(input.quoterHasImages && input.quotedHasVideo);
}

function shouldTransitionV2QuoteToV1(input = {}) {
    return Boolean(input.quotedHasVideo);
}

module.exports = {
    getQuoteDisplayPolicy,
    shouldTransitionV1QuoteToV2,
    shouldTransitionV2QuoteToV1
};
