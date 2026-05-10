/**
 * TFD 系統 - Iwara V2 最佳化提取器
 * 使用官方 API + 雙訊息系統 + 三層品質顯示
 */

const IwaraExtractorV2 = require('../../utils/iwara-extractor-v2');
const TFDEmbedBuilder = require('../utils/embed-builder');
const URLConverterLogger = require('../utils/url-converter-logger');

class IwaraV2TFDExtractor {
    constructor() {
        this.iwaraV2 = new IwaraExtractorV2();
        this.embedBuilder = new TFDEmbedBuilder();
        this.name = 'Iwara V2 最佳化';

        // 初始化日誌已移除（減少啟動時輸出）
    }

    /**
     * 處理 Iwara URL - V2 最佳化版本
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            switch (patternName) {
                case 'video':
                    return await this.extractOptimized(originalURL, message);
                case 'profile':
                    // 個人資料不轉換
                    return this.createNoConversionResponse(originalURL);
                default:
                    throw new Error(`不支援的 Iwara 模式: ${patternName}`);
            }
        } catch (error) {
            console.error(`[IWARA V2] 提取失敗: ${error.message}`);
            // 出錯時回退到簡化模式
            console.log(`[IWARA V2] 回退到簡化模式`);
            return this.fallbackToSimple(originalURL, message);
        }
    }

    /**
     * 最佳化提取 - 使用 V2 API + 雙訊息系統
     * @param {string} originalURL
     * @param {Object} message
     * @returns {Promise<Object>}
     */
    async extractOptimized(originalURL, message = null) {
        console.log(`[IWARA V2] 開始最佳化提取: ${originalURL}`);

        // 使用 V2 API 提取完整資訊
        const extractResult = await this.iwaraV2.extractVideoInfo(originalURL);

        if (!extractResult.success) {
            throw new Error(extractResult.error);
        }

        // 生成 Discord 內容 (包含雙訊息)
        const discordContent = this.iwaraV2.generateDiscordContent(extractResult);

        // 記錄最佳化提取
        URLConverterLogger.logConversion('iwara', message, extractResult, null, null);

        const result = {
            success: true,
            siteName: 'iwara',
            contentType: 'optimized_extraction',
            embed: discordContent.embed,
            data: extractResult,
            extractorMode: 'v2_optimized'
        };

        // 啟用雙訊息系統 (預覽訊息)
        if (discordContent.previewMessage) {
            result.additionalContent = {
                type: 'preview_message',
                content: discordContent.previewMessage,
                delay: 1000 // 1秒延遲
            };
        }

        console.log(`[IWARA V2] 最佳化提取成功: ${extractResult.title}`);
        return result;
    }

    /**
     * 回退到簡化模式 (域名替換)
     * @param {string} originalURL
     * @param {Object} message
     * @returns {Object}
     */
    fallbackToSimple(originalURL, message = null) {
        console.log(`[IWARA V2] 使用簡化模式: ${originalURL}`);

        // 簡單的域名替換 (向後相容)
        const convertedURL = originalURL
            .replace('www.iwara.tv', 'fxiwara.seria.moe')
            .replace('iwara.tv', 'fxiwara.seria.moe');

        // 記錄簡化轉換
        URLConverterLogger.logConversion('iwara', message, null, null, convertedURL);

        return {
            success: true,
            siteName: 'iwara',
            contentType: 'url_conversion',
            convertedURL: convertedURL,
            extractorMode: 'simple_fallback',
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
        console.log(`[IWARA V2] 個人資料不轉換: ${originalURL}`);

        return {
            success: true,
            siteName: 'iwara',
            contentType: 'no_conversion',
            extractorMode: 'no_conversion',
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
            embed: this.embedBuilder.createErrorEmbed(`Iwara V2 提取失敗: ${message}`, url),
            siteName: 'iwara',
            extractorMode: 'error'
        };
    }

    /**
     * 健康檢查 - 測試 V2 API 連通性
     * @returns {Promise<Object>}
     */
    async healthCheck() {
        try {
            // 測試認證功能
            const authResult = await this.iwaraV2.authenticate();

            return {
                healthy: true,
                authenticationWorking: authResult,
                advancedModeEnabled: this.enableAdvancedMode,
                dualMessageEnabled: this.enableDualMessage,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                advancedModeEnabled: this.enableAdvancedMode,
                dualMessageEnabled: this.enableDualMessage,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * 取得提取器狀態
     * @returns {Object}
     */
    getStatus() {
        return {
            name: this.name,
            version: '2.0',
            mode: 'optimized',
            features: {
                officialAPI: true,
                authentication: true,
                multiQuality: true,
                discordPreview: true,
                dualMessage: true,
                fallbackMode: true
            }
        };
    }
}

module.exports = IwaraV2TFDExtractor;