/**
 * TFD 系統 - Pornhub 提取器
 * 使用域名替換提供嵌入預覽功能
 */

const URLConverterLogger = require('../utils/url-converter-logger');

class PornhubExtractor {
    constructor() {
        this.name = 'Pornhub 簡易';
        // 初始化日誌已移除（減少啟動時輸出）
    }

    /**
     * 處理 Pornhub URL
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            switch (patternName) {
                case 'video':
                case 'videoNew':
                case 'embed':
                    return this.extractVideo(originalURL, extractedData, message);
                default:
                    throw new Error(`不支援的 Pornhub 模式: ${patternName}`);
            }
        } catch (error) {
            console.error(`[Pornhub] 提取失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 提取影片資訊（簡易版：域名替換）
     * @param {string} originalURL
     * @param {Object} extractedData
     * @param {Object} message
     * @returns {Object}
     */
    extractVideo(originalURL, extractedData, message = null) {
        console.log(`[Pornhub] 處理影片: ${originalURL}`);

        // 轉換為官方嵌入 URL 格式
        // https://www.pornhub.com/embed/[viewkey]
        const viewkey = extractedData.viewkey || extractedData.videoId;

        if (!viewkey) {
            console.error('[Pornhub] 無法提取 viewkey 或 videoId');
            return this.createErrorResponse('無法提取影片 ID', originalURL);
        }

        const convertedURL = `https://www.pornhub.com/embed/${viewkey}`;

        // 記錄轉換
        URLConverterLogger.logConversion('pornhub', message, null, null, convertedURL);

        return {
            success: true,
            siteName: 'pornhub',
            contentType: 'url_conversion',
            convertedURL: convertedURL,
            extractorMode: 'official_embed',
            data: {
                originalURL: originalURL,
                convertedURL: convertedURL,
                conversionMethod: 'official_embed_url',
                viewkey: viewkey
            }
        };
    }

    /**
     * 建立錯誤回應
     * @param {string} message
     * @param {string} url
     * @returns {Object}
     */
    createErrorResponse(message, url) {
        return {
            success: false,
            error: message,
            siteName: 'pornhub',
            url: url
        };
    }
}

module.exports = PornhubExtractor;
