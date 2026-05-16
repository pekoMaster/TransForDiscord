/**
 * 網址轉換統一 LOG 工具
 * 格式: [MM/DD-HH:mm:ss] [網址轉換] [Guild] [Channel] [User] [SNS] link
 */

const tfd = require('./tfd-logger');

class URLConverterLogger {
    static PLATFORM_LABELS = {
        'twitter': 'X', 'x': 'X',
        'pixiv': 'Pixiv', 'bilibili': 'Bilibili', 'instagram': 'IG',
        'youtube': 'YT', 'facebook': 'FB', 'iwara': 'Iwara', 'ptt': 'PTT',
        'threads': 'Threads', 'bahamut': 'Bahamut', 'bahamut-gnn': 'GNN',
        'pornhub': 'PH', 'nikke': 'Nikke', '4gamers': '4Gamers',
        'cts': 'CTS', 'udn': 'UDN', 'xfastest': 'XFastest',
        'msn': 'MSN', 'linetoday': 'LineToday', 'mobile01': 'Mobile01',
        'pokewiki': 'PokeWiki',
    };

    /**
     * @param {string} platform - 平台 key
     * @param {Object|null} message - Discord 訊息物件
     * @param {string} detail - 連結或說明
     */
    static logConversion(platform, message, detail) {
        const sns     = this.PLATFORM_LABELS[platform?.toLowerCase()] || platform?.toUpperCase() || '?';
        const guild   = message?.guild?.name || '—';
        const channel = message?.channel?.name || '—';
        const user    = message?.member?.displayName
                     || message?.author?.globalName
                     || message?.author?.username
                     || '—';

        console.log(`${tfd.ts()} [網址轉換] [${guild}] [${channel}] [${user}] [${sns}] ${detail}`);
    }

    static logError(platform, originalURL, error) {
        const sns = this.PLATFORM_LABELS[platform?.toLowerCase()] || platform?.toUpperCase() || '?';
        console.error(`${tfd.ts()} [網址轉換] [${sns}] ❌ ${originalURL} - ${error}`);
    }
}

module.exports = URLConverterLogger;
