const PLATFORM_PATTERNS = [
    ['twitter.com', 'twitter'],
    ['x.com', 'twitter'],
    ['pixiv.net', 'pixiv'],
    ['youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
    ['instagram.com', 'instagram'],
    ['threads.net', 'threads'],
    ['ptt.cc', 'ptt']
];

function resolveAuthorId(message) {
    if (!message) return null;

    if (message.content) {
        const lines = message.content.split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const match = lines[i].match(/# <@!?(\d+)>/);
            if (match) return match[1];
        }
    }

    try {
        const first = message.components?.[0]?.components?.[0];
        if (first) {
            const content = first.content || first.data?.content || '';
            const match = content.match(/# <@!?(\d+)>/);
            if (match) return match[1];
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

function extractUrlFromMessage(message) {
    const content = message?.content || '';
    const match = content.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
    return match ? match[0] : '';
}

module.exports = {
    resolveAuthorId,
    detectPlatformFromUrl,
    extractUrlFromMessage
};
