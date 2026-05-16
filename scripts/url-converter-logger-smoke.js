const assert = require('assert');

const SharedURLConverterLogger = require('../src/shared/logging/url-converter-logger');
const LegacyURLConverterLogger = require('../tfd-system/utils/url-converter-logger');

assert.strictEqual(LegacyURLConverterLogger, SharedURLConverterLogger);
assert.strictEqual(SharedURLConverterLogger.PLATFORM_LABELS.twitter, 'X');
assert.strictEqual(SharedURLConverterLogger.PLATFORM_LABELS.instagram, 'IG');
assert.strictEqual(SharedURLConverterLogger.PLATFORM_LABELS['bahamut-gnn'], 'GNN');
assert.strictEqual(SharedURLConverterLogger.PLATFORM_LABELS.pokewiki, 'PokeWiki');

const logs = [];
const errors = [];
const originalLog = console.log;
const originalError = console.error;

try {
    console.log = message => logs.push(message);
    console.error = message => errors.push(message);

    SharedURLConverterLogger.logConversion('twitter', {
        guild: { name: 'Guild' },
        channel: { name: 'channel' },
        member: { displayName: 'Display' },
        author: { username: 'Author' }
    }, 'https://vxtwitter.com/a');

    SharedURLConverterLogger.logConversion('mastodon', null, 'https://example.social/post');
    SharedURLConverterLogger.logError('pixiv', 'https://www.pixiv.net/artworks/123', 'broken');
} finally {
    console.log = originalLog;
    console.error = originalError;
}

assert.match(
    logs[0],
    /^\[\d{2}\/\d{2}-\d{2}:\d{2}:\d{2}\] \[網址轉換\] \[Guild\] \[channel\] \[Display\] \[X\] https:\/\/vxtwitter\.com\/a$/
);
assert.match(
    logs[1],
    /^\[\d{2}\/\d{2}-\d{2}:\d{2}:\d{2}\] \[網址轉換\] \[—\] \[—\] \[—\] \[MASTODON\] https:\/\/example\.social\/post$/
);
assert.match(
    errors[0],
    /^\[\d{2}\/\d{2}-\d{2}:\d{2}:\d{2}\] \[網址轉換\] \[Pixiv\] ❌ https:\/\/www\.pixiv\.net\/artworks\/123 - broken$/
);

console.log('url-converter-logger smoke ok');
