/**
 * Shared persistent cache for tweet translations.
 *
 * Cache entries are provider-aware so the same tweet can be translated by
 * Gemini, OpenRouter, OpenAI, or Claude without overwriting each other.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tfd = require('./tfd-logger');

const CACHE_DIR = path.join(__dirname, '../data/translation_cache');
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const memoryIndex = new Map();

function makeKey(sourceId, provider = 'unknown') {
    return `${sourceId}_${provider || 'unknown'}`;
}

function fileNameForKey(cacheKey) {
    return `${crypto.createHash('sha1').update(cacheKey).digest('hex')}.json`;
}

function filePathForKey(cacheKey) {
    return path.join(CACHE_DIR, fileNameForKey(cacheKey));
}

function normalizeEntry(sourceId, provider, data = {}) {
    const translated = data.translated || {
        main: data.translatedText || data.fullText || '',
        quote: data.translatedQuoteText || data.quoteText || '',
        reply: data.translatedReplyText || data.replyText || ''
    };
    const original = data.original || {
        main: data.originalText || '',
        quote: data.originalQuoteText || '',
        reply: data.originalReplyText || ''
    };

    return {
        cacheKey: makeKey(sourceId, provider),
        sourceId,
        provider,
        original,
        translated,
        translatedText: translated.main,
        originalText: original.main,
        model: data.model || provider || 'unknown',
        timestamp: data.timestamp || Date.now()
    };
}

function init() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        tfd.sys('SharedCache', `Created translation cache directory: ${CACHE_DIR}`);
    }

    let loaded = 0;
    let cleaned = 0;
    const cutoff = Date.now() - TTL_MS;

    try {
        const files = fs.readdirSync(CACHE_DIR).filter(file => file.endsWith('.json'));
        for (const file of files) {
            const fullPath = path.join(CACHE_DIR, file);
            try {
                const entry = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                if (!entry.timestamp || entry.timestamp < cutoff) {
                    fs.unlinkSync(fullPath);
                    cleaned++;
                    continue;
                }

                const sourceId = entry.sourceId || entry.tweetId;
                if (!sourceId) continue;
                const provider = entry.provider || entry.model || 'unknown';
                const normalized = normalizeEntry(sourceId, provider, entry);
                memoryIndex.set(normalized.cacheKey, normalized);
                loaded++;
            } catch (_) {
                try { fs.unlinkSync(fullPath); } catch (_) {}
                cleaned++;
            }
        }
    } catch (_) {}

    tfd.sys('SharedCache', `Loaded ${loaded} translation cache entries, cleaned ${cleaned}.`);
}

function get(sourceId, provider = 'unknown') {
    const cacheKey = makeKey(sourceId, provider);
    const entry = memoryIndex.get(cacheKey);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > TTL_MS) {
        memoryIndex.delete(cacheKey);
        try { fs.unlinkSync(filePathForKey(cacheKey)); } catch (_) {}
        return null;
    }

    return entry;
}

function set(sourceId, providerOrData, maybeData = null) {
    const provider = typeof providerOrData === 'string'
        ? providerOrData
        : providerOrData?.provider || providerOrData?.model || 'unknown';
    const data = typeof providerOrData === 'string' ? (maybeData || {}) : (providerOrData || {});
    const entry = normalizeEntry(sourceId, provider, data);

    memoryIndex.set(entry.cacheKey, entry);

    try {
        fs.writeFileSync(
            filePathForKey(entry.cacheKey),
            JSON.stringify(entry),
            'utf8'
        );
    } catch (error) {
        tfd.sysError('SharedCache', `Failed to write translation cache: ${error.message}`);
    }

    return entry;
}

function cleanup() {
    const cutoff = Date.now() - TTL_MS;
    let count = 0;

    for (const [cacheKey, entry] of memoryIndex) {
        if (entry.timestamp < cutoff) {
            memoryIndex.delete(cacheKey);
            try { fs.unlinkSync(filePathForKey(cacheKey)); } catch (_) {}
            count++;
        }
    }

    if (count > 0) {
        tfd.sys('SharedCache', `Cleaned ${count} expired translation cache entries.`);
    }
}

function stats() {
    return {
        count: memoryIndex.size,
        cacheDir: CACHE_DIR
    };
}

module.exports = { init, get, set, cleanup, stats, makeKey };
