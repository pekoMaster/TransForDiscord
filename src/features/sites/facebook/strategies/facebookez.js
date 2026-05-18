/**
 * TFD 系統 - Facebook/Instagram 提取器
 * 使用 facebed.com 服務處理 Facebook 和 EmbedEZ 風格處理 Instagram
 */

const HTTPClient = require('../../../../shared/http/http-client');
const TFDEmbedBuilder = require('../../../../shared/discord/embed-builder');
const tfd = require('../../../../shared/logging/tfd-logger');

class FacebookEZExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.embedBuilder = new TFDEmbedBuilder();
        this.name = 'Facebook/Instagram';
    }

    /**
     * 處理 Facebook/Instagram URL
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { siteName, patternName, extractedData, originalURL } = matchResult;

        try {
            if (siteName === 'facebook') {
                return await this.extractFacebook(patternName, extractedData, originalURL);
            } else if (siteName === 'instagram') {
                return await this.extractInstagram(patternName, extractedData, originalURL);
            } else {
                throw new Error(`不支援的網站: ${siteName}`);
            }
        } catch (error) {
            tfd.sysError('TFD-FacebookEZ', `提取失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 提取 Facebook 內容
     * @param {string} patternName
     * @param {Array} extractedData
     * @param {string} originalURL
     * @returns {Promise<Object>}
     */
    async extractFacebook(patternName, extractedData, originalURL) {
        // 使用 facebed.com 服務：facebook.com -> facebed.com (最佳預覽效果)
        const convertedURL = this.convertToFacebed(originalURL);

        tfd.sys('TFD-Facebook', `Facebook URL 轉換 (${patternName}): ${originalURL} -> ${convertedURL}`);

        return {
            success: true,
            siteName: 'facebook',
            contentType: 'url_conversion',
            convertedURL: convertedURL,
            data: {
                originalURL: originalURL,
                convertedURL: convertedURL,
                patternName: patternName,
                extractedData: extractedData
            }
        };
    }

    /**
     * 提取 Instagram 內容（進階版本）
     * @param {string} patternName
     * @param {Array} extractedData
     * @param {string} originalURL
     * @returns {Promise<Object>}
     */
    async extractInstagram(patternName, extractedData, originalURL) {
        // 使用 EmbedEZ 風格的轉換：instagram.com -> instagramez.com
        const convertedURL = this.convertToInstagramEZ(originalURL);

        tfd.sys('TFD-FacebookEZ', `Instagram URL 轉換: ${originalURL} -> ${convertedURL}`);

        return {
            success: true,
            siteName: 'instagram',
            contentType: 'url_conversion',
            convertedURL: convertedURL,
            data: {
                originalURL: originalURL,
                convertedURL: convertedURL,
                patternName: patternName
            }
        };
    }

    /**
     * 智慧轉換 Facebook URL 為最佳的 facebed share/p 格式
     * @param {string} url
     * @returns {string}
     */
    convertToFacebed(url) {
        try {
            // 智慧提取 ID 並轉換為 share/p 格式
            const shareUrl = this.extractAndConvertToShare(url);
            if (shareUrl) {
                return shareUrl;
            }

            // 回退到基本轉換
            if (url.includes('www.facebook.com')) {
                return url.replace('www.facebook.com', 'facebed.com');
            } else if (url.includes('facebook.com')) {
                return url.replace('facebook.com', 'facebed.com');
            } else if (url.includes('m.facebook.com')) {
                return url.replace('m.facebook.com', 'facebed.com');
            }
            return url;
        } catch (error) {
            tfd.sysError('TFD-Facebook', `Facebook URL 轉換失敗: ${error.message}`);
            return url;
        }
    }

    /**
     * 智慧轉換 Facebook URL - 僅轉換已知可用格式
     * @param {string} url
     * @returns {string|null}
     */
    extractAndConvertToShare(url) {
        // 只轉換已知可用的 share 格式
        const sharePatterns = {
            shareP: /share\/p\/([A-Za-z0-9_-]+)/,
            shareV: /share\/v\/([A-Za-z0-9_-]+)/
        };

        for (const [name, pattern] of Object.entries(sharePatterns)) {
            const match = url.match(pattern);
            if (match) {
                const id = match[1];
                tfd.sys('TFD-Facebook', `保持 ${name} 格式，ID: ${id}`);

                // 只替換域名，保持 share 格式不變
                return url.replace(/(?:www\.)?facebook\.com/, 'facebed.com');
            }
        }

        // 其他格式不強制轉換為 share，使用基本域名替換
        return null;
    }

    /**
     * 轉換 Instagram URL 為 EmbedEZ 格式
     * @param {string} url
     * @returns {string}
     */
    convertToInstagramEZ(url) {
        try {
            // 將 instagram.com 替換為 instagramez.com（基於 EmbedEZ 模式）
            if (url.includes('www.instagram.com')) {
                return url.replace('www.instagram.com', 'www.instagramez.com');
            } else if (url.includes('instagram.com')) {
                return url.replace('instagram.com', 'instagramez.com');
            }
            return url;
        } catch (error) {
            tfd.sysError('TFD-FacebookEZ', `Instagram URL 轉換失敗: ${error.message}`);
            return url;
        }
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
            embed: this.embedBuilder.createErrorEmbed(`Facebook/Instagram 取得失敗: ${message}`, url),
            siteName: 'facebook'
        };
    }
}

module.exports = FacebookEZExtractor;
