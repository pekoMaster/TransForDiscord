const { ActionRowBuilder } = require('discord.js');
const tlog = require('../../../../../utils/tfd-logger');
const { extractMarkerTextFromMessage } = require('./shared');

function createDefaultExtractor() {
    const TFDTwitterExtractor = require('../../extractors/twitter-v2-extractor');
    return new TFDTwitterExtractor();
}

async function buildV1TransitionPayload(interaction, tweetId, cached, options = {}) {
    if (!cached?.tweet) return null;

    const extractor = options.extractor || createDefaultExtractor();
    const tweet = cached.tweet;
    const originalURL = cached.originalURL || `https://twitter.com/i/status/${tweetId}`;
    const tweetType = extractor.analyzeTweetType(tweet);
    const quoteInfo = extractor.isQuoteTweet(tweet) ? extractor.getQuoteTweetInfo(tweet) : null;
    const replyInfo = extractor.isReplyTweet(tweet) ? await extractor.getReplyTweetInfo(tweet) : null;
    const embedResult = extractor.buildEnhancedEmbed(tweet, originalURL, replyInfo, tweetType, quoteInfo, false);

    if (!embedResult?.embed) return null;

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

    return {
        content: extractMarkerTextFromMessage(interaction.message) || null,
        embeds: [embedResult.embed],
        components
    };
}

async function transitionV2ToV1(interaction, tweetId, cached, options = {}) {
    const logger = options.logger || tlog;
    const payload = await buildV1TransitionPayload(interaction, tweetId, cached, options);
    if (!payload) return false;

    try {
        await interaction.editReply(payload);
        return true;
    } catch (editError) {
        logger.sysWarn('V2-Toggle', `V2->V1 edit fallback required for ${tweetId}: ${editError.message}`);
    }

    try {
        await interaction.channel.send(payload);
        await interaction.message.delete().catch(() => null);
        return true;
    } catch (sendError) {
        logger.sysError('V2-Toggle', `V2->V1 fallback send failed for ${tweetId}: ${sendError.message}`);
        return false;
    }
}

module.exports = {
    buildV1TransitionPayload,
    transitionV2ToV1
};
