const assert = require('node:assert/strict');
const { test } = require('node:test');
const URLMatcher = require('../src/core/routing/url-matcher');

const matcher = new URLMatcher();

const threadsUrl = 'https://www.threads.com/@alice/post/ABC123';
const pttUrl = 'https://www.ptt.cc/bbs/C_Chat/M.1710000000.A.ABC.html';
const xUrl = 'https://x.com/alice/status/1234567890';

test('extractURLs keeps previewable URLs in message order', () => {
    assert.deepEqual(
        matcher.extractURLs(`first ${threadsUrl} middle ${pttUrl} last`),
        [threadsUrl, pttUrl]
    );
});

test('extractURLs ignores wrapped duplicates but keeps later bare URLs', () => {
    assert.deepEqual(
        matcher.extractURLs(`<${threadsUrl}> ${threadsUrl}`),
        [threadsUrl]
    );
    assert.deepEqual(
        matcher.extractURLs(`\`${pttUrl}\` ${pttUrl}`),
        [pttUrl]
    );
});

test('extractURLs ignores angle, inline code, and fenced code URLs', () => {
    const content = [
        `<${threadsUrl}>`,
        `\`${pttUrl}\``,
        '```',
        xUrl,
        '```'
    ].join('\n');

    assert.deepEqual(matcher.extractURLs(content), []);
});

test('stripProcessedURLs preserves user text and non-triggering URL shells', () => {
    const content = [
        `before <${threadsUrl}>`,
        `middle ${threadsUrl}`,
        `code \`${pttUrl}\``,
        `after ${pttUrl}`
    ].join('\n');

    assert.equal(
        matcher.stripProcessedURLs(content, [threadsUrl, pttUrl]),
        [`before <${threadsUrl}>`, 'middle', `code \`${pttUrl}\``, 'after'].join('\n')
    );
});

test('stripProcessedURLs consumes exact spoiler URL shells without affecting normal URLs', () => {
    const content = `alpha ||${pttUrl}|| beta ${threadsUrl} gamma`;

    assert.equal(
        matcher.stripProcessedURLs(content, [pttUrl, threadsUrl]),
        'alpha beta gamma'
    );
});
