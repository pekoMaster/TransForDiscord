const assert = require('node:assert/strict');

const {
    cacheTweetData,
    getCachedTweetData,
    clearTweetCacheForTest,
    pruneExpiredTweetCache,
    CACHE_TTL_MS
} = require('../src/features/twitter/state/v2-tweet-cache');

clearTweetCacheForTest();

const now = 1_000_000;
cacheTweetData('100', { tweet: { id: '100' }, originalURL: 'https://x.com/i/status/100' }, now);

const cached = getCachedTweetData('100', now + 1000);
assert.equal(cached.tweet.id, '100');
assert.equal(cached.originalURL, 'https://x.com/i/status/100');
assert.equal(typeof cached.timestamp, 'number');

const expired = getCachedTweetData('100', now + CACHE_TTL_MS + 1);
assert.equal(expired, null);

cacheTweetData('fresh', { tweet: { id: 'fresh' } }, now);
cacheTweetData('old', { tweet: { id: 'old' } }, now - CACHE_TTL_MS - 10);
const removed = pruneExpiredTweetCache(now);
assert.equal(removed, 1);
assert.equal(getCachedTweetData('fresh', now), getCachedTweetData('fresh', now));
assert.equal(getCachedTweetData('old', now), null);

clearTweetCacheForTest();
assert.equal(getCachedTweetData('fresh', now), null);

console.log('twitter v2 tweet cache smoke ok');
