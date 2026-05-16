const { MessageFlags, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const {
    buildV2Container,
    getCachedTweetData,
    deriveStateFromComponents
} = require('../../containers/v2-container-builder');
const { lookupUrl } = require('../../../../../tfd-system/utils/url-stats');
const { getMessageState, setMessageState } = require('../../state/v2-state-store');
const { extractMarkerTextFromMessage } = require('./shared');
const { getCachedV2Translation } = require('./translation-cache');
const { hydrateTweetBundle } = require('./tweet-data');

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

async function rebuildAndUpdate(interaction, tweetId, stateOverrides = {}, options = {}) {
    const { refreshData = false } = options;

    let cached = getCachedTweetData(tweetId);
    if (!cached || refreshData) {
        try {
            cached = await hydrateTweetBundle(tweetId, cached?.originalURL);
        } catch (_) {
            cached = null;
        }
    }

    if (!cached) {
        await interaction.followUp({
            content: '找不到推文資料，請重新抓取一次後再試。',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }

    const { tweet, originalURL, quoteData, replyData } = cached;
    const storedState = getMessageState(interaction.message.id) || buildFallbackState(interaction, tweetId, cached);
    const newState = {
        ...storedState,
        ...stateOverrides,
        tweetId,
        originalURL,
        markerText: stateOverrides.markerText !== undefined ? stateOverrides.markerText : storedState.markerText
    };

    let urlStats = null;
    try {
        const tweetUrl = originalURL || `https://twitter.com/i/status/${tweetId}`;
        if (interaction.guildId && interaction.channelId) {
            urlStats = lookupUrl(tweetUrl, interaction.guildId, interaction.channelId);
        }
    } catch (_) {}

    const container = buildV2Container(tweet, originalURL, {
        isTranslated: newState.isTranslated,
        translatedText: newState.translatedText || null,
        translatedQuoteText: newState.translatedQuoteText || null,
        translatedReplyText: newState.translatedReplyText || null,
        isQuoteShown: newState.isQuoteShown,
        isReplyShown: newState.isReplyShown,
        isExpanded: newState.isExpanded,
        quoteData,
        replyData,
        urlStats
    });

    if (newState.markerText) {
        container.components = [
            new TextDisplayBuilder().setContent(newState.markerText),
            new SeparatorBuilder().setDivider(true),
            ...container.components
        ];
    }

    await interaction.editReply({
        content: null,
        embeds: [],
        components: [container],
        flags: MessageFlags.IsComponentsV2
    });

    setMessageState(interaction.message.id, newState);
    return true;
}

module.exports = {
    buildFallbackState,
    rebuildAndUpdate
};
