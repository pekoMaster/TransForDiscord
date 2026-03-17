/**
 * Ermiana 系統 - Iwara 簡化提取器
 * 使用簡單的域名替換 (如同原始 embed-fixer)
 */

const ErmianaEmbedBuilder = require('../utils/embed-builder');
const URLConverterLogger = require('../utils/url-converter-logger');

class IwaraSimpleExtractor {
    constructor() {
        this.embedBuilder = new ErmianaEmbedBuilder();
        this.name = 'Iwara';
    }

    /**
     * 處理 Iwara URL - 簡化版本
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            switch (patternName) {
                case 'video':
                    return this.convertToFxiwara(originalURL, message);
                case 'profile':
                    // 個人資料不轉換
                    return this.createNoConversionResponse(originalURL);
                default:
                    throw new Error(`不支援的 Iwara 模式: ${patternName}`);
            }
        } catch (error) {
            console.error(`[Ermiana-Iwara] 提取失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 轉換 Iwara URL 為 fxiwara URL (簡單域名替換)
     * @param {string} originalURL
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Object}
     */
    convertToFxiwara(originalURL, message = null) {
        // 簡單的域名替換 (如同原始 embed-fixer)
        const convertedURL = originalURL
            .replace('www.iwara.tv', 'fxiwara.seria.moe')
            .replace('iwara.tv', 'fxiwara.seria.moe');

        // 記錄網址轉換
        URLConverterLogger.logConversion('iwara', message, null, null, convertedURL);

        return {
            success: true,
            siteName: 'iwara',
            contentType: 'url_conversion',
            convertedURL: convertedURL,
            data: {
                originalURL: originalURL,
                convertedURL: convertedURL,
                conversionMethod: 'simple_domain_replacement'
            }
        };
    }

    /**
     * 個人資料不轉換
     * @param {string} originalURL
     * @returns {Object}
     */
    createNoConversionResponse(originalURL) {
        console.log(`[Ermiana-Iwara] 個人資料不轉換: ${originalURL}`);

        return {
            success: true,
            siteName: 'iwara',
            contentType: 'no_conversion',
            data: {
                originalURL: originalURL,
                reason: 'Profile URLs are not converted'
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
            embed: this.embedBuilder.createErrorEmbed(`Iwara 取得失敗: ${message}`, url),
            siteName: 'iwara'
        };
    }
}

module.exports = IwaraSimpleExtractor;