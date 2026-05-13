/**
 * 共用輔助函式 — 從 PekoEmbed 訊息中提取資訊
 */

const PLATFORM_PATTERNS = [
    ['twitter.com', 'twitter'], ['x.com', 'twitter'],
    ['pixiv.net', 'pixiv'],
    ['youtube.com', 'youtube'], ['youtu.be', 'youtube'],
    ['instagram.com', 'instagram'],
    ['threads.net', 'threads'],
    ['ptt.cc', 'ptt'],
    ['facebook.com', 'facebook'],
];

function resolveAuthorId(msg) {
    if (!msg) return null;
    if (msg.content) {
        const lines = msg.content.split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const m = lines[i].match(/# <@!?(\d+)>/);
            if (m) return m[1];
        }
    }
    try {
        const first = msg.components?.[0]?.components?.[0];
        if (first) {
            const c = first.content || first.data?.content || '';
            const m = c.match(/# <@!?(\d+)>/);
            if (m) return m[1];
        }
    } catch (_) {}
    return null;
}

function detectPlatformFromUrl(url) {
    if (!url) return 'unknown';
    for (const [pattern, platform] of PLATFORM_PATTERNS) {
        if (url.includes(pattern)) return platform;
    }
    return 'unknown';
}

function extractUrlFromMessage(msg) {
    const content = msg?.content || '';
    const m = content.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
    return m ? m[0] : '';
}

module.exports = { resolveAuthorId, detectPlatformFromUrl, extractUrlFromMessage };
