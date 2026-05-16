const assert = require('assert');

const SharedTextTruncator = require('../src/shared/discord/text-truncator');
const LegacyTextTruncator = require('../tfd-system/utils/text-truncator');

assert.strictEqual(LegacyTextTruncator, SharedTextTruncator);

const truncator = new SharedTextTruncator();

assert.strictEqual(truncator.maxCharacters, 300);
assert.strictEqual(truncator.truncateMessage, '...(其餘請進入原推文觀看)');
assert.strictEqual(truncator.calculateCharacterCount('abc中文'), 7);

const shortResult = truncator.truncateText('short text');
assert.deepStrictEqual(shortResult, {
    originalText: 'short text',
    truncatedText: 'short text',
    characterCount: 10,
    isTruncated: false
});

const longText = 'word '.repeat(100);
const longResult = truncator.truncateText(longText);
assert.strictEqual(longResult.isTruncated, true);
assert.strictEqual(longResult.originalText, longText);
assert.ok(longResult.truncatedText.includes('...(其餘請進入原推文觀看)'));

const url = 'https://example.com/' + 'a'.repeat(120);
const urlText = `${'x'.repeat(260)} ${url} tail`;
const urlResult = truncator.truncateText(urlText);
assert.strictEqual(urlResult.isTruncated, true);
assert.ok(urlResult.truncatedText.includes(`🔗 ${url}`));

const tweetResult = truncator.processTweetContent(longText, 'Smoke');
assert.strictEqual(tweetResult.isTruncated, true);
assert.strictEqual(tweetResult.fullText, longText);
assert.strictEqual(tweetResult.text, longResult.truncatedText);

console.log('text-truncator smoke ok');
