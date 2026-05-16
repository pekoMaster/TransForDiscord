const { getCachedTweetData } = require('../../containers/v2-container-builder');
const { getMessageState } = require('../../state/v2-state-store');
const tlog = require('../../../../../utils/tfd-logger');
const { extractTweetId } = require('./shared');
const { getCachedV2Translation } = require('./translation-cache');
const { buildFallbackState, rebuildAndUpdate } = require('./view-updater');

async function handleV2Toggle(interaction, type) {
    const tweetId = extractTweetId(interaction.customId);
    await interaction.deferUpdate();

    const overrides = {};
    if (type === 'all') {
        const isExpanding = interaction.customId.startsWith('v2_expand_all_');
        overrides.isQuoteShown = isExpanding;
        overrides.isReplyShown = isExpanding;
        overrides.isExpanded = isExpanding;
    }

    const cachedTranslation = getCachedV2Translation(tweetId);
    if (cachedTranslation) {
        const currentState = getMessageState(interaction.message.id) || buildFallbackState(interaction, tweetId, getCachedTweetData(tweetId));
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
