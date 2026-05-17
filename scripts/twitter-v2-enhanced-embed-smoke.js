const assert = require('node:assert/strict');
const { EmbedBuilder } = require('discord.js');

const {
    buildEnhancedEmbed,
    setEnhancedEmbedImages
} = require('../src/features/twitter/extractors/v2/enhanced-embed');

function createDependencies(overrides = {}) {
    return {
        textTruncator: {
            processTweetContent: (text, label) => ({
                text: `${label}:${text}`,
                fullText: text,
                isTruncated: text.length > 12
            })
        },
        extractImagesFromTweet: tweet => tweet._images || [],
        ...overrides
    };
}

const tweet = {
    id: '100',
    text: 'main text long',
    likes: 10,
    retweets: 2,
    replies: 1,
    created_at: '2024-01-01T00:00:00.000Z',
    author: {
        screen_name: 'tester',
        name: 'Tester',
        avatar_url: 'https://example.com/avatar.jpg'
    },
    _blacklistEntry: {
        level: 2,
        label: '警告'
    },
    _images: [{ url: 'https://example.com/main.jpg' }]
};

const quoteInfo = {
    tweetId: '200',
    tweet: {
        text: 'quote line 1\n\nquote line 2',
        author: {
            screen_name: 'quoted',
            name: 'Quoted'
        },
        _images: [{ url: 'https://example.com/quote.jpg' }]
    }
};

const result = buildEnhancedEmbed(
    tweet,
    'https://twitter.com/tester/status/100',
    null,
    'quote-with-media',
    quoteInfo,
    true,
    createDependencies()
);

const embedJSON = result.embed.toJSON();

assert.equal(embedJSON.author.name, '@tester');
assert.equal(embedJSON.author.icon_url, 'https://example.com/avatar.jpg');
assert.equal(embedJSON.author.url, 'https://twitter.com/tester');
assert.equal(embedJSON.title, 'Tester');
assert.equal(embedJSON.url, 'https://twitter.com/tester/status/100');
assert.equal(embedJSON.description, '||主推文:main text long||');
assert.equal(embedJSON.image, undefined);
assert.equal(embedJSON.timestamp, '2024-01-01T00:00:00.000Z');
assert.equal(embedJSON.footer.text, '警告，觀看內文請自行斟酌');
assert.equal(result.truncationResult.fullText, 'main text long');
assert.equal(embedJSON.fields.length, 1);
assert.equal(embedJSON.fields[0].name, '\u200B');
assert.equal(
    embedJSON.fields[0].value,
    '> [RT](https://twitter.com/quoted/status/200): Quoted ([@quoted](https://twitter.com/quoted))\n> 　\n> 引用推文:quote line 1\n> 　\n> quote line 2'
);

const hiddenQuote = buildEnhancedEmbed(
    tweet,
    'https://twitter.com/tester/status/100',
    null,
    'quote-with-media',
    quoteInfo,
    false,
    createDependencies()
).embed.toJSON();

assert.equal(hiddenQuote.fields, undefined);

const replyEmbed = new EmbedBuilder();
setEnhancedEmbedImages(replyEmbed, {
    _images: [{ url: 'https://example.com/reply-own.jpg' }]
}, {
    tweet: {
        _images: [{ url: 'https://example.com/original-reply.jpg' }]
    }
}, 'reply-with-media', null, createDependencies());
assert.equal(replyEmbed.toJSON().image.url, 'https://example.com/reply-own.jpg');

const spoilerEmbed = new EmbedBuilder();
assert.throws(() => setEnhancedEmbedImages(spoilerEmbed, {
    _blacklistEntry: {
        level: 2
    },
    _images: [{ url: 'https://example.com/spoiler.jpg' }]
}, null, 'single', null, createDependencies()));

const quoteFallbackEmbed = new EmbedBuilder();
setEnhancedEmbedImages(quoteFallbackEmbed, {
    _images: []
}, null, 'quote', {
    tweet: {
        _images: [{ url: 'https://example.com/quote-only.jpg' }]
    }
}, createDependencies());
assert.equal(quoteFallbackEmbed.toJSON().image.url, 'https://example.com/quote-only.jpg');

console.log('twitter v2 enhanced embed smoke ok');
