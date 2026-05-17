const assert = require('node:assert/strict');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

const {
    buildMixedMediaTweetResponse,
    buildMixedMediaTweetFallbackResponse
} = require('../src/features/twitter/extractors/v2/mixed-media-response');

function button(customId) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(customId)
        .setStyle(ButtonStyle.Secondary);
}

function createDependencies(overrides = {}) {
    return {
        isReplyTweet: () => true,
        getReplyTweetInfo: async () => ({ tweet: { id: 'reply-1' } }),
        isQuoteTweet: () => true,
        getQuoteTweetInfo: () => ({ tweet: { id: 'quote-1' } }),
        processVideoOptimization: async () => ({
            hasVideoAttachment: true,
            videoAttachment: { name: 'video.mp4' },
            cleanup: async () => null,
            videoInfo: { source: 'optimizer' }
        }),
        buildEnhancedEmbed: (_tweet, _url, replyInfo, _tweetType, quoteInfo) => ({
            embed: new EmbedBuilder()
                .setTitle(`reply:${replyInfo?.tweet?.id}`)
                .setDescription(`quote:${quoteInfo?.tweet?.id}`)
        }),
        extractVideoUrls: () => ['https://video/1.mp4', 'https://video/2.mp4'],
        formatVideoUrls: videoUrls => videoUrls.map((url, index) => `[video${index + 1}](${url})`),
        buildPaginationButtons: () => [new ActionRowBuilder().addComponents(button('twitter_page_1'))],
        buildTranslateButtonComponent: tweetId => button(`twitter_translate_${tweetId}`),
        buildAllToggleButtonComponent: tweetId => button(`twitter_expand_all_${tweetId}`),
        buildReloadButtonComponent: tweetId => button(`twitter_reload_${tweetId}`),
        extractMultipleImages: () => ['https://image/1.jpg'],
        addTranslateButtonToComponents: (components, tweet) => [
            ...(components || []),
            new ActionRowBuilder().addComponents(button(`twitter_translate_${tweet.id}`))
        ],
        createErrorResponse: errorMessage => ({ success: false, error: errorMessage }),
        logger: {
            sysError: () => null
        },
        ...overrides
    };
}

async function run() {
    const tweet = {
        id: '100',
        text: 'mixed media body',
        media: {
            all: [
                { type: 'video', url: 'https://video/1.mp4' },
                { type: 'photo', url: 'https://image/1.jpg' }
            ]
        }
    };

    const result = await buildMixedMediaTweetResponse(
        tweet,
        'https://twitter.com/tester/status/100',
        'video-with-images',
        createDependencies()
    );

    assert.equal(result.success, true);
    assert.equal(result.contentType, 'video-with-images');
    assert.deepEqual(result.videoUrls, ['[video2](https://video/2.mp4)']);
    assert.deepEqual(result.multipleImages, ['https://image/1.jpg']);
    assert.equal(result.mixedMedia, true);
    assert.equal(result.originalText, 'mixed media body');
    assert.equal(result.originalURL, 'https://twitter.com/tester/status/100');
    assert.equal(result.tweetId, '100');
    assert.deepEqual(result.videoAttachment, { name: 'video.mp4' });
    assert.deepEqual(result.videoAttachmentInfo, { source: 'optimizer' });
    assert.equal(typeof result.videoAttachmentCleanup, 'function');
    assert.equal(result.components.length, 2);
    assert.equal(result.components[0].components[0].data.custom_id, 'twitter_page_1');
    assert.equal(result.components[1].components.length, 3);
    assert.equal(result.components[1].components[0].data.custom_id, 'twitter_translate_100');
    assert.equal(result.components[1].components[1].data.custom_id, 'twitter_expand_all_100');
    assert.equal(result.components[1].components[2].data.custom_id, 'twitter_reload_100');

    const fallbackResult = await buildMixedMediaTweetFallbackResponse(
        tweet,
        'https://twitter.com/tester/status/100',
        'video-with-images',
        createDependencies({
            buildEnhancedEmbed: () => ({ embed: new EmbedBuilder().setTitle('fallback') }),
            processVideoOptimization: async () => null
        })
    );

    assert.equal(fallbackResult.success, true);
    assert.equal(fallbackResult.contentType, 'video-with-images');
    assert.deepEqual(fallbackResult.videoUrls, [
        '[video1](https://video/1.mp4)',
        '[video2](https://video/2.mp4)'
    ]);
    assert.equal(fallbackResult.mixedMedia, true);
    assert.equal(fallbackResult.tweetId, '100');
    assert.equal(fallbackResult.originalText, 'mixed media body');
    assert.equal(fallbackResult.components.length, 2);
    assert.equal(fallbackResult.components[1].components[0].data.custom_id, 'twitter_translate_100');

    console.log('twitter v2 mixed media response smoke ok');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
