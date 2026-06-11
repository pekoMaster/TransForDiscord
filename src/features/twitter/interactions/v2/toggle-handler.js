const { resolveTweetBundle } = require('./tweet-data');
const tlog = require('../../../../../utils/tfd-logger');
const { extractTweetId } = require('./shared');
const { getCachedV2Translation } = require('./translation-cache');
const { buildFallbackState } = require('./render-state');
const { rebuildAndUpdate } = require('./view-updater');
const { getStoredViewState } = require('./view-message-state');
const { shouldTransitionV2QuoteToV1 } = require('../../extractors/v2/quote-display-policy');
const mediaClassifier = require('../../extractors/v2/media-classifier');
const { transitionV2ToV1 } = require('./v1-transition');

async function handleV2Toggle(interaction, type) {
    const tweetId = extractTweetId(interaction.customId);
    await interaction.deferUpdate();

    const overrides = {};
    if (type === 'all') {
        const isExpanding = interaction.customId.startsWith('v2_expand_all_');
        if (!isExpanding) {
            const cached = await resolveTweetBundle(tweetId);
            const quotedHasVideo = cached?.quoteData?.tweet
                ? mediaClassifier.hasVideoContent(cached.quoteData.tweet)
                : false;
            if (shouldTransitionV2QuoteToV1({ quotedHasVideo })) {
                const transitioned = await transitionV2ToV1(interaction, tweetId, cached);
                if (transitioned) return;
                tlog.sysWarn('V2-Toggle', `V2->V1 transition failed; keeping V2 collapsed for ${tweetId}`);
            }
        }
        overrides.isQuoteShown = isExpanding;
        overrides.isReplyShown = isExpanding;
        overrides.isExpanded = isExpanding;
    }

    const cachedTranslation = getCachedV2Translation(tweetId);
    if (cachedTranslation) {
        const currentState = getStoredViewState(interaction) || buildFallbackState(interaction, tweetId, await resolveTweetBundle(tweetId));
        if (currentState.isTranslated) {
            overrides.isTranslated = true;
            overrides.translatedText = cachedTranslation.translatedText;
            overrides.translatedQuoteText = cachedTranslation.translatedQuoteText;
            overrides.translatedReplyText = cachedTranslation.translatedReplyText;
        }
    }

    await rebuildAndUpdate(interaction, tweetId, overrides);
    tlog.log('V2-展開', interaction, `${type} 切換: ${tweetId}`);
}

module.exports = {
    handleV2Toggle
};
