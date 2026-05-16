const CACHE_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const v2TweetCache = new Map();

function cacheTweetData(tweetId, data, now = Date.now()) {
    v2TweetCache.set(String(tweetId), {
        ...data,
        timestamp: now
    });
}

function getCachedTweetData(tweetId, now = Date.now()) {
    const key = String(tweetId);
    const cached = v2TweetCache.get(key);
    if (!cached) return null;

    if (now - cached.timestamp > CACHE_TTL_MS) {
        v2TweetCache.delete(key);
        return null;
    }

    return cached;
}

function pruneExpiredTweetCache(now = Date.now()) {
    let removed = 0;
    for (const [key, value] of v2TweetCache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
            v2TweetCache.delete(key);
            removed++;
        }
    }
    return removed;
}

function clearTweetCacheForTest() {
    v2TweetCache.clear();
}

const cleanupTimer = setInterval(() => {
    pruneExpiredTweetCache();
}, CLEANUP_INTERVAL_MS);

if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
}

module.exports = {
    CACHE_TTL_MS,
    CLEANUP_INTERVAL_MS,
    cacheTweetData,
    getCachedTweetData,
    pruneExpiredTweetCache,
    clearTweetCacheForTest
};
