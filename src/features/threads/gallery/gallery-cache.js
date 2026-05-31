const crypto = require('crypto');

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

function cleanupExpired() {
    const now = Date.now();
    for (const [id, entry] of cache.entries()) {
        if (now - entry.createdAt > CACHE_TTL_MS) {
            cache.delete(id);
        }
    }
}

function createGalleryState(data) {
    cleanupExpired();
    const id = crypto.randomBytes(6).toString('hex');
    cache.set(id, {
        ...data,
        galleryId: id,
        createdAt: Date.now()
    });
    return id;
}

function getGalleryState(id) {
    cleanupExpired();
    return cache.get(id) || null;
}

function setGalleryState(id, data) {
    cache.set(id, {
        ...data,
        createdAt: Date.now()
    });
}

module.exports = {
    createGalleryState,
    getGalleryState,
    setGalleryState,
    cleanupExpired,
    CACHE_TTL_MS
};
