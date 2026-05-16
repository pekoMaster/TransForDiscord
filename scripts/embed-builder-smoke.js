const assert = require('assert');

const SharedEmbedBuilder = require('../src/shared/discord/embed-builder');
const LegacyEmbedBuilder = require('../tfd-system/utils/embed-builder');

assert.strictEqual(LegacyEmbedBuilder, SharedEmbedBuilder);

const builder = new SharedEmbedBuilder();

const basic = builder.createBasicEmbed({
    title: 'T'.repeat(300),
    description: 'Description',
    url: 'https://example.com',
    image: 'https://example.com/image.jpg',
    thumbnail: 'https://example.com/thumb.jpg',
    color: 0x123456,
    author: { name: 'Author', iconURL: 'https://example.com/a.png', url: 'https://example.com/author' },
    footer: { text: 'Footer', iconURL: 'https://example.com/f.png' },
    timestamp: '2026-05-16T00:00:00.000Z'
}).toJSON();

assert.strictEqual(basic.title.length, 256);
assert.strictEqual(basic.description, 'Description');
assert.strictEqual(basic.url, 'https://example.com');
assert.strictEqual(basic.image.url, 'https://example.com/image.jpg');
assert.strictEqual(basic.thumbnail.url, 'https://example.com/thumb.jpg');
assert.strictEqual(basic.color, 0x123456);
assert.strictEqual(basic.author.name, 'Author');
assert.strictEqual(basic.footer.text, 'Footer');
assert.ok(basic.timestamp);

const social = builder.createSocialMediaEmbed({
    title: 'Social',
    stats: { likes: 1200, retweets: 2, comments: 3, views: 4000000 }
}).toJSON();
assert.strictEqual(social.fields.length, 4);
assert.deepStrictEqual(social.fields.map(field => field.value), ['1.2K', '2', '3', '4.0M']);

const artwork = builder.createArtworkEmbed({
    title: 'Artwork',
    artist: 'Artist',
    tags: ['a', 'b'],
    dimensions: '100x100',
    rating: 'safe'
}).toJSON();
assert.strictEqual(artwork.fields.length, 4);

const forum = builder.createForumEmbed({ title: 'Forum', board: 'Board', replies: 12, score: 34 }).toJSON();
assert.strictEqual(forum.fields.length, 3);

const video = builder.createVideoEmbed({
    title: 'Video',
    duration: 125,
    views: 1234,
    uploadDate: '2026-05-16T00:00:00.000Z'
}).toJSON();
assert.strictEqual(video.fields.length, 3);

const error = builder.createErrorEmbed('Broken', 'https://example.com/broken').toJSON();
assert.strictEqual(error.description, 'Broken');
assert.strictEqual(error.url, 'https://example.com/broken');
assert.strictEqual(error.color, 0xff0000);

assert.strictEqual(builder.truncateText('abcdef', 5), 'ab...');
assert.strictEqual(builder.formatNumber(1500000), '1.5M');
assert.strictEqual(builder.formatNumber(1200), '1.2K');
assert.strictEqual(builder.formatDuration(3661), '1:01:01');
assert.strictEqual(builder.formatDuration(61), '1:01');
assert.strictEqual(builder.getSiteColor('twitter'), 0x1DA1F2);
assert.strictEqual(builder.getSiteColor('unknown'), builder.defaultColor);

console.log('embed-builder smoke ok');
