/**
 * Komica 串快取
 * 提取器與互動處理器共用，避免重複抓取
 * TTL: 30 分鐘
 */
const CACHE_TTL = 30 * 60 * 1000;

// threadId -> { posts, boardName, threadUrl, fetchedAt }
const cache = new Map();

function set(threadId, data) {
    cache.set(String(threadId), { ...data, fetchedAt: Date.now() });
}

function get(threadId) {
    const entry = cache.get(String(threadId));
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL) {
        cache.delete(String(threadId));
        return null;
    }
    return entry;
}

function del(threadId) {
    cache.delete(String(threadId));
}

module.exports = { set, get, del };
