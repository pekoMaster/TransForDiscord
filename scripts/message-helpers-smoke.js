const assert = require('assert');

const sharedHelper = require('../src/shared/discord/message-helpers');
const legacyHelper = require('../utils/embed-helpers');

assert.strictEqual(legacyHelper.resolveAuthorId, sharedHelper.resolveAuthorId);
assert.strictEqual(legacyHelper.detectPlatformFromUrl, sharedHelper.detectPlatformFromUrl);
assert.strictEqual(legacyHelper.extractUrlFromMessage, sharedHelper.extractUrlFromMessage);

assert.strictEqual(
    sharedHelper.resolveAuthorId({ content: 'first\n# <@1234567890>' }),
    '1234567890'
);
assert.strictEqual(
    sharedHelper.resolveAuthorId({ components: [{ components: [{ data: { content: '# <@!998877>' } }] }] }),
    '998877'
);
assert.strictEqual(sharedHelper.resolveAuthorId({ content: 'no author' }), null);

assert.strictEqual(sharedHelper.extractUrlFromMessage({ content: 'see https://x.com/i/status/1 now' }), 'https://x.com/i/status/1');
assert.strictEqual(sharedHelper.extractUrlFromMessage({ content: 'no url' }), '');

assert.strictEqual(sharedHelper.detectPlatformFromUrl('https://x.com/i/status/1'), 'twitter');
assert.strictEqual(sharedHelper.detectPlatformFromUrl('https://www.pixiv.net/artworks/1'), 'pixiv');
assert.strictEqual(sharedHelper.detectPlatformFromUrl('https://example.com'), 'unknown');

console.log('message-helpers smoke ok');
