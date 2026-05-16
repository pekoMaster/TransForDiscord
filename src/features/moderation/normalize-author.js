/**
 * Post-extraction author normalization
 *
 * Extractors don't consistently provide result.author or result.uid as
 * direct fields.  This module maps each siteName -> { author, uid, platform }
 * by inspecting the extractor's return object + Discord message.
 *
 * All author strings are trimmed and lowercased for consistent matching.
 */

function normalizeAuthorForBlacklist(result, message) {
    const siteName = result.siteName || 'unknown';
    const base = { platform: siteName, author: null, uid: null };
    const fn = normalizers[siteName];
    if (fn) {
        try {
            const info = fn(result, message);
            if (info.author) info.author = info.author.trim().toLowerCase();
            return { ...base, ...info };
        } catch (_) { return base; }
    }
    return base;
}

function getEmbedAuthorName(embed) {
    return embed?.author?.name || embed?.data?.author?.name || null;
}

function getEmbedFooterText(embed) {
    return embed?.footer?.text || embed?.data?.footer?.text || null;
}

const normalizers = {

    twitter(result) {
        const t = result.tweet;
        if (t && t.author) {
            return {
                author: t.author.screen_name || null,
                uid: t.author.id ? String(t.author.id) : null
            };
        }
        const authorName = getEmbedAuthorName(result.embed);
        if (authorName) {
            return { author: authorName.replace(/^@/, ''), uid: null };
        }
        return {};
    },

    ptt(result) {
        if (result.author) {
            const m = result.author.match(/^([^\s(]+)/);
            return { author: m ? m[1] : result.author, uid: null };
        }
        const authorName = getEmbedAuthorName(result.embed);
        if (authorName) {
            return { author: authorName, uid: null };
        }
        return {};
    },

    pixiv(result) {
        const authorName = getEmbedAuthorName(result.embed);
        if (authorName) {
            return { author: authorName, uid: null };
        }
        const footerText = getEmbedFooterText(result.embed);
        if (footerText) {
            const m = footerText.match(/by\s+(.+?)(?:\s*[-\u2013\u2014]|$)/i);
            if (m) return { author: m[1], uid: null };
        }
        return {};
    },

    youtube(result) {
        const authorName = getEmbedAuthorName(result.embed);
        if (authorName) {
            return { author: authorName, uid: null };
        }
        return {};
    },

    instagram(result) {
        const authorName = getEmbedAuthorName(result.embed);
        if (authorName) {
            return { author: authorName.replace(/^@/, ''), uid: null };
        }
        return {};
    },

    threads(result) {
        const authorName = getEmbedAuthorName(result.embed);
        if (authorName) {
            return { author: authorName.replace(/^@/, ''), uid: null };
        }
        return {};
    },

    facebook(result) {
        const authorName = getEmbedAuthorName(result.embed);
        if (authorName) {
            return { author: authorName, uid: null };
        }
        return {};
    }
};

module.exports = { normalizeAuthorForBlacklist };
