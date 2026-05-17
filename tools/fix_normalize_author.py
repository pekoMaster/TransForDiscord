"""Fix normalize-author.js: embed.author -> embed.data.author compatibility"""

path = "/root/TransForDiscord/utils/normalize-author.js"

content = r'''/**
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

// EmbedBuilder stores fields under .data; plain objects don't.
function getEmbedAuthor(embed) {
    if (!embed) return null;
    const a = (embed.data && embed.data.author) || embed.author;
    return a && a.name ? a : null;
}

function getEmbedFooter(embed) {
    if (!embed) return null;
    const f = (embed.data && embed.data.footer) || embed.footer;
    return f && f.text ? f : null;
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
        const a = getEmbedAuthor(result.embed);
        if (a) return { author: a.name.replace(/^@/, ''), uid: null };
        return {};
    },

    ptt(result) {
        if (result.author) {
            const m = result.author.match(/^([^\s(]+)/);
            return { author: m ? m[1] : result.author, uid: null };
        }
        const a = getEmbedAuthor(result.embed);
        if (a) return { author: a.name, uid: null };
        return {};
    },

    pixiv(result) {
        const a = getEmbedAuthor(result.embed);
        if (a) return { author: a.name, uid: null };
        const f = getEmbedFooter(result.embed);
        if (f) {
            const m = f.text.match(/by\s+(.+?)(?:\s*[-–—]|$)/i);
            if (m) return { author: m[1], uid: null };
        }
        return {};
    },

    youtube(result) {
        const a = getEmbedAuthor(result.embed);
        if (a) return { author: a.name, uid: null };
        return {};
    },

    instagram(result) {
        const a = getEmbedAuthor(result.embed);
        if (a) return { author: a.name.replace(/^@/, ''), uid: null };
        return {};
    },

    threads(result) {
        const a = getEmbedAuthor(result.embed);
        if (a) return { author: a.name.replace(/^@/, ''), uid: null };
        return {};
    },

    facebook(result) {
        const a = getEmbedAuthor(result.embed);
        if (a) return { author: a.name, uid: null };
        return {};
    }
};

module.exports = { normalizeAuthorForBlacklist };
'''

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("normalize-author.js fixed!")
