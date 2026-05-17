const assert = require('node:assert/strict');
const {
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const {
    buildArticleTweetResponse
} = require('../src/features/twitter/extractors/v2/article-response');

function button(customId) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(customId)
        .setStyle(ButtonStyle.Secondary);
}

function createDependencies(overrides = {}) {
    return {
        textTruncator: {
            processTweetContent: text => ({
                text: `short:${text}`,
                fullText: text,
                isTruncated: true
            })
        },
        buildTranslateButtonComponent: tweetId => button(`twitter_translate_${tweetId}`),
        buildAllToggleButtonComponent: tweetId => button(`twitter_expand_all_${tweetId}`),
        buildReloadButtonComponent: tweetId => button(`twitter_reload_${tweetId}`),
        ...overrides
    };
}

const articleTweet = {
    id: '900',
    author: {
        screen_name: 'tester',
        name: 'Tester',
        avatar_url: 'https://example.com/avatar.jpg'
    },
    article: {
        title: 'Article title',
        content: {
            blocks: [
                { text: 'first paragraph' },
                { text: 'second paragraph' },
                { text: '   ' }
            ]
        },
        cover_media: {
            original_img_url: 'https://example.com/cover.jpg'
        }
    },
    engagement: {
        likes: 10,
        retweets: 2,
        views: 100
    },
    created_timestamp: 1710000000
};

const articleResult = buildArticleTweetResponse(
    articleTweet,
    'https://twitter.com/tester/status/900',
    createDependencies()
);

const articleEmbed = articleResult.embed.toJSON();

assert.equal(articleResult.success, true);
assert.equal(articleResult.contentType, 'article');
assert.equal(articleResult.originalText, 'first paragraph\n\nsecond paragraph');
assert.equal(articleResult.fullText, 'first paragraph\n\nsecond paragraph');
assert.equal(articleResult.tweetId, '900');
assert.equal(articleEmbed.title, 'Article title');
assert.equal(articleEmbed.url, 'https://twitter.com/tester/status/900');
assert.equal(articleEmbed.description, 'short:first paragraph\n\nsecond paragraph');
assert.equal(articleEmbed.image.url, 'https://example.com/cover.jpg');
assert.equal(articleEmbed.timestamp, '2024-03-09T16:00:00.000Z');
assert.equal(articleResult.components.length, 1);
assert.equal(articleResult.components[0].components.length, 3);
assert.equal(articleResult.components[0].components[0].data.custom_id, 'twitter_translate_900');
assert.equal(articleResult.components[0].components[1].data.custom_id, 'twitter_expand_all_900');
assert.equal(articleResult.components[0].components[2].data.custom_id, 'twitter_reload_900');

const previewResult = buildArticleTweetResponse({
    id: '901',
    author: {
        screen_name: 'previewer',
        name: 'Previewer'
    },
    article: {
        preview_text: 'preview fallback text'
    }
}, 'https://twitter.com/previewer/status/901', createDependencies({
    textTruncator: {
        processTweetContent: text => ({
            text,
            fullText: text,
            isTruncated: false
        })
    }
}));

assert.equal(previewResult.originalText, 'preview fallback text');
assert.equal(previewResult.fullText, 'preview fallback text');
assert.equal(previewResult.components[0].components.length, 2);
assert.equal(previewResult.components[0].components[0].data.custom_id, 'twitter_translate_901');
assert.equal(previewResult.components[0].components[1].data.custom_id, 'twitter_reload_901');

console.log('twitter v2 article response smoke ok');
