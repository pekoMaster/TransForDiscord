/**
 * 內容快取模組
 * 提供 cacheContent / getCachedContent 供翻譯、展開等功能使用
 */

const contentCache = new Map();

const CACHE_TTL = 30 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of contentCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            contentCache.delete(key);
        }
    }
}, 5 * 60 * 1000);

function cacheContent(sourceId, text) {
    if (!sourceId || !text) return;
    contentCache.set(sourceId, {
        text: text,
        timestamp: Date.now()
    });
}

function getCachedContent(sourceId) {
    const cached = contentCache.get(sourceId);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > CACHE_TTL) {
        contentCache.delete(sourceId);
        return null;
    }

    return cached.text;
}

module.exports = {
    cacheContent,
    getCachedContent
};
