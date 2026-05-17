const { ActionRowBuilder } = require('discord.js');

function appendMixedMediaToggleRow(components, tweet, quoteInfo, replyInfo, dependencies) {
    const toggleButtons = [];
    const textContent = tweet.text || '';
    if (textContent.trim().length >= 10) {
        toggleButtons.push(dependencies.buildTranslateButtonComponent(tweet.id, false));
    }

    const hasExpandable = Boolean(
        quoteInfo?.tweet ||
        replyInfo?.tweet
    );
    if (hasExpandable) {
        toggleButtons.push(dependencies.buildAllToggleButtonComponent(tweet.id, false));
    }

    toggleButtons.push(dependencies.buildReloadButtonComponent(tweet.id));

    if (toggleButtons.length === 0) return components;

    const toggleRow = new ActionRowBuilder().addComponents(...toggleButtons);
    if (components) {
        if (components.length < 5) {
            components.push(toggleRow);
        }
        return components;
    }

    return [toggleRow];
}

async function buildMixedMediaTweetResponse(tweet, originalURL, tweetType, dependencies) {
    try {
        let replyInfo = null;
        if (dependencies.isReplyTweet(tweet)) {
            replyInfo = await dependencies.getReplyTweetInfo(tweet);
        }

        let quoteInfo = null;
        if (dependencies.isQuoteTweet(tweet)) {
            quoteInfo = dependencies.getQuoteTweetInfo(tweet);
        }

        const videoOptimization = await dependencies.processVideoOptimization(tweet, originalURL);
        const embedResult = dependencies.buildEnhancedEmbed(tweet, originalURL, replyInfo, tweetType, quoteInfo, false);
        const embed = embedResult.embed;

        const videoUrls = dependencies.extractVideoUrls(tweet);
        let formattedVideoUrls = dependencies.formatVideoUrls(videoUrls);

        if (videoOptimization && videoOptimization.hasVideoAttachment && formattedVideoUrls.length > 0) {
            formattedVideoUrls = formattedVideoUrls.slice(1);
        }

        let components = dependencies.buildPaginationButtons(tweet, tweetType);
        components = appendMixedMediaToggleRow(components, tweet, quoteInfo, replyInfo, dependencies);

        const images = dependencies.extractMultipleImages(tweet);

        const result = {
            success: true,
            embed: embed,
            components: components,
            siteName: 'twitter',
            contentType: tweetType,
            videoUrls: formattedVideoUrls,
            multipleImages: images.length > 0 ? images : null,
            mixedMedia: true,
            originalText: tweet.text,
            originalURL: originalURL,
            tweetId: tweet.id
        };

        if (videoOptimization) {
            result.videoAttachment = videoOptimization.videoAttachment;
            result.videoAttachmentCleanup = videoOptimization.cleanup;
            result.videoAttachmentInfo = videoOptimization.videoInfo;
        }

        return result;
    } catch (error) {
        dependencies.logger.sysError('Enhanced-Twitter', `混合媒體處理失敗: ${error.message}`);
        return dependencies.createErrorResponse(error.message, originalURL);
    }
}

async function buildMixedMediaTweetFallbackResponse(tweet, originalURL, tweetType, dependencies) {
    const embedResult = dependencies.buildEnhancedEmbed(tweet, originalURL, null, tweetType, null);
    const embed = embedResult.embed;

    const videoUrls = dependencies.extractVideoUrls(tweet);
    const formattedVideoUrls = dependencies.formatVideoUrls(videoUrls);

    let components = dependencies.buildPaginationButtons(tweet, tweetType);
    components = dependencies.addTranslateButtonToComponents(components, tweet);

    return {
        success: true,
        embed: embed,
        components: components,
        siteName: 'twitter',
        contentType: tweetType,
        videoUrls: formattedVideoUrls,
        mixedMedia: true,
        tweetId: tweet.id,
        originalText: tweet.text
    };
}

module.exports = {
    buildMixedMediaTweetResponse,
    buildMixedMediaTweetFallbackResponse
};
