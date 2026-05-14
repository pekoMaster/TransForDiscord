/**
 * TFD 系統 - YouTube 連結轉換器
 * 將 /live/ 格式的 YouTube 直播連結自動轉換為標準 /watch?v= 格式
 *
 * 支援格式：
 *   - youtube.com/live/{videoId}         → youtube.com/watch?v={videoId}
 *   - youtube.com/live/{videoId}?si=xxx  → youtube.com/watch?v={videoId}
 *
 * 回傳 contentType: 'url_conversion'，由 message-handler-v2.js 統一用 webhook 發送
 */

const tfd = require('../../utils/tfd-logger');
class YouTubeExtractor {
    constructor() {
        this.name = 'YouTube';
    }

    /**
     * @param {Object} matchResult - URLMatcher.matchURL() 的回傳值
     * @param {Object} [message]   - Discord 訊息物件（可選）
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { originalURL, matches } = matchResult;
        const videoId = matches ? matches[1] : null; // regex capture group 1 = videoId

        if (!videoId) {
            return { success: false, error: '無法取得 videoId', siteName: 'youtube' };
        }

        const convertedURL = `https://www.youtube.com/watch?v=${videoId}`;

        tfd.sys('YouTube', `/live/ → /watch/ 轉換: ${originalURL} → ${convertedURL}`);

        return {
            success: true,
            siteName: 'youtube',
            contentType: 'url_conversion',
            convertedURL,
            originalURL
        };
    }
}

module.exports = YouTubeExtractor;
