/**
 * In-memory state store for Twitter V2 webhook messages.
 * Keeps the current render state separate from the rendered UI so reloads can
 * refresh tweet data without guessing state back from components.
 */

const STATE_TTL_MS = 6 * 60 * 60 * 1000;
const messageStateCache = new Map();

function normalizeState(state = {}) {
    return {
        tweetId: state.tweetId || null,
        originalURL: state.originalURL || null,
        markerText: state.markerText || null,
        isTranslated: Boolean(state.isTranslated),
        translatedText: state.translatedText || null,
        translatedQuoteText: state.translatedQuoteText || null,
        translatedReplyText: state.translatedReplyText || null,
        isExpanded: Boolean(state.isExpanded),
        isQuoteShown: Boolean(state.isQuoteShown),
        isReplyShown: Boolean(state.isReplyShown),
    };
}

function setMessageState(messageId, state) {
    if (!messageId) return null;
    const normalized = normalizeState(state);
    messageStateCache.set(messageId, {
        ...normalized,
        timestamp: Date.now()
    });
    return normalized;
}

function getMessageState(messageId) {
    if (!messageId) return null;
    const cached = messageStateCache.get(messageId);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > STATE_TTL_MS) {
        messageStateCache.delete(messageId);
        return null;
    }
    return normalizeState(cached);
}

function updateMessageState(messageId, patch = {}) {
    const current = getMessageState(messageId) || {};
    return setMessageState(messageId, { ...current, ...patch });
}

function deleteMessageState(messageId) {
    if (!messageId) return;
    messageStateCache.delete(messageId);
}

setInterval(() => {
    const now = Date.now();
    for (const [messageId, state] of messageStateCache.entries()) {
        if (now - state.timestamp > STATE_TTL_MS) {
            messageStateCache.delete(messageId);
        }
    }
}, 30 * 60 * 1000).unref();

module.exports = {
    setMessageState,
    getMessageState,
    updateMessageState,
    deleteMessageState,
};
