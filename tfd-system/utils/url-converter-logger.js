/**
 * 網址轉換統一 LOG 工具
 * 提供標準化的網址轉換日誌格式
 */

class URLConverterLogger {
    /**
     * 平台標識對照表
     */
    static PLATFORM_LABELS = {
        'twitter': 'X',
        'x': 'X',
        'pixiv': 'Pixiv',
        'bilibili': 'Bilibili',
        'instagram': 'IG',
        'youtube': 'YT',
        'facebook': 'FB',
        'iwara': 'Iwara',
        'ptt': 'PTT'
    };

    /**
     * 記錄網址轉換
     * @param {string} platform - 平台名稱 (twitter, pixiv, bilibili 等)
     * @param {Object} message - Discord 訊息物件 (可選)
     * @param {string} username - 用戶名稱 (可選)
     * @param {string} channelName - 頻道名稱 (可選)
     * @param {string} convertedURL - 轉換後的網址
     */
    static logConversion(platform, message = null, username = null, channelName = null, convertedURL) {
        // 取得時間戳
        const now = new Date();
        const timestamp = now.toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        // 取得平台標籤
        const platformLabel = this.PLATFORM_LABELS[platform.toLowerCase()] || platform.toUpperCase();

        // 取得頻道和用戶資訊
        let finalChannelName = channelName;
        let finalUsername = username;

        if (message) {
            finalChannelName = finalChannelName || message.channel?.name || 'unknown';
            finalUsername = finalUsername || message.author?.username || 'unknown';
        } else {
            finalChannelName = finalChannelName || 'unknown';
            finalUsername = finalUsername || 'unknown';
        }

        // 輸出統一格式的 LOG
        console.log(`[${timestamp}] [網址轉換] [${platformLabel}] [${finalChannelName}] [${finalUsername}] : ${convertedURL}`);
    }

    /**
     * 記錄轉換錯誤 (保持詳細資訊用於除錯)
     * @param {string} platform - 平台名稱
     * @param {string} originalURL - 原始網址
     * @param {string} error - 錯誤訊息
     */
    static logError(platform, originalURL, error) {
        const now = new Date();
        const timestamp = now.toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const platformLabel = this.PLATFORM_LABELS[platform.toLowerCase()] || platform.toUpperCase();

        console.error(`[${timestamp}] [網址轉換錯誤] [${platformLabel}] ${originalURL} - ${error}`);
    }
}

module.exports = URLConverterLogger;