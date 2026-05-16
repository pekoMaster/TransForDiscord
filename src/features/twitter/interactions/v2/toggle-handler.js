const { ActionRowBuilder } = require('discord.js');
const { getCachedTweetData } = require('../../containers/v2-container-builder');
const { getMessageState } = require('../../state/v2-state-store');
const tlog = require('../../../../../utils/tfd-logger');
const { extractMarkerTextFromMessage, extractTweetId } = require('./shared');
const { getCachedV2Translation } = require('./translation-cache');
const { buildFallbackState, rebuildAndUpdate } = require('./view-updater');
const { shouldTransitionV2QuoteToV1 } = require('../../extractors/v2/quote-display-policy');
const mediaClassifier = require('../../extractors/v2/media-classifier');

async function handleV2Toggle(interaction, type) {
    const tweetId = extractTweetId(interaction.customId);
    await interaction.deferUpdate();

    const overrides = {};
    if (type === 'all') {
        const isExpanding = interaction.customId.startsWith('v2_expand_all_');
        if (!isExpanding) {
            const cached = getCachedTweetData(tweetId);
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

async function transitionV2ToV1(interaction, tweetId, cached) {
    if (!cached?.tweet) return false;

    const TFDTwitterExtractor = require('../../extractors/twitter-v2-extractor');
    const extractor = new TFDTwitterExtractor();
    const tweet = cached.tweet;
    const originalURL = cached.originalURL || `https://twitter.com/i/status/${tweetId}`;
    const tweetType = extractor.analyzeTweetType(tweet);
    const quoteInfo = extractor.isQuoteTweet(tweet) ? extractor.getQuoteTweetInfo(tweet) : null;
    const replyInfo = extractor.isReplyTweet(tweet) ? await extractor.getReplyTweetInfo(tweet) : null;
    const embedResult = extractor.buildEnhancedEmbed(tweet, originalURL, replyInfo, tweetType, quoteInfo, false);

    if (!embedResult?.embed) return false;

    const components = extractor.buildPaginationButtons(tweet, tweetType) || [];
    const toggleButtons = [];
    const textContent = tweet.text || '';
    if (textContent.trim().length >= 10) {
        toggleButtons.push(extractor.buildTranslateButtonComponent(tweet.id, false));
    }

    const hasExpandable = Boolean(
        quoteInfo?.tweet ||
        replyInfo?.tweet ||
        embedResult.truncationResult?.isTruncated
    );
    if (hasExpandable) {
        toggleButtons.push(extractor.buildAllToggleButtonComponent(tweet.id, false));
    }

    toggleButtons.push(extractor.buildReloadButtonComponent(tweet.id));
    if (toggleButtons.length > 0 && components.length < 5) {
        components.push(new ActionRowBuilder().addComponents(...toggleButtons.slice(0, 5)));
    }

    const payload = {
        content: extractMarkerTextFromMessage(interaction.message) || null,
        embeds: [embedResult.embed],
        components
    };

    try {
        await interaction.editReply(payload);
        return true;
    } catch (editError) {
        tlog.sysWarn('V2-Toggle', `V2->V1 edit fallback required for ${tweetId}: ${editError.message}`);
    }

    try {
        await interaction.channel.send(payload);
        await interaction.message.delete().catch(() => null);
        return true;
    } catch (sendError) {
        tlog.sysError('V2-Toggle', `V2->V1 fallback send failed for ${tweetId}: ${sendError.message}`);
        return false;
    }
}

module.exports = {
    handleV2Toggle
};
