/**
 * TFD 系統 - 增強版 Bilibili URL 轉換器
 * 支援完整的 bilibili.com 和 b23.tv 到 vxbilibili.com 和 vxb23.tv 轉換
 * 包含語言參數處理和智能 URL 解析
 */

const URLConverterLogger = require('../../../shared/logging/url-converter-logger');

class BilibiliExtractor {
    constructor() {
        this.name = 'Enhanced-Bilibili';
    }

    /**
     * 處理 Bilibili URL - 智能轉換為 VX 格式
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            // 根據不同類型的 URL 進行轉換
            const result = this.convertToVxBilibili(originalURL, patternName, extractedData);

            // 記錄網址轉換
            URLConverterLogger.logConversion('bilibili', message, result.convertedURL);

            return {
                success: true,
                siteName: 'bilibili',
                contentType: 'url_conversion',
                convertedURL: result.convertedURL,
                originalURL: originalURL,
                patternType: patternName,
                hasLanguageParam: result.hasLanguageParam,
                preservedParams: result.preservedParams,
                // 提供重定向而非嵌入
                redirect: true,
                redirectURL: result.convertedURL,
                embed: null
            };

        } catch (error) {
            URLConverterLogger.logError('bilibili', originalURL, error.message);
            return {
                success: false,
                error: error.message,
                siteName: 'bilibili',
                originalURL: originalURL
            };
        }
    }

    /**
     * 智能將 Bilibili URL 轉換為 VX 格式
     * @param {string} originalURL
     * @param {string} patternName
     * @param {Object} extractedData
     * @returns {Object}
     */
    convertToVxBilibili(originalURL, patternName, extractedData) {
        // 解析 URL 組件
        const urlParts = this.parseURL(originalURL);

        let convertedURL;
        let hasLanguageParam = false;
        let preservedParams = {};

        // 根據 URL 類型進行轉換
        if (patternName === 'shortUrl') {
            // b23.tv → vxb23.tv
            convertedURL = this.convertShortURL(urlParts, extractedData);
        } else if (patternName === 'live') {
            // 直播間 URL
            convertedURL = this.convertLiveURL(urlParts, extractedData);
        } else {
            // 普通 bilibili.com URL → vxbilibili.com
            convertedURL = this.convertRegularURL(urlParts, patternName, extractedData);
        }

        // 處理語言參數和其他重要參數
        const paramsResult = this.processURLParameters(urlParts.search, patternName);
        if (paramsResult.finalParams) {
            convertedURL += '?' + paramsResult.finalParams;
            hasLanguageParam = paramsResult.hasLanguageParam;
            preservedParams = paramsResult.preservedParams;
        }

        return {
            convertedURL,
            hasLanguageParam,
            preservedParams
        };
    }

    /**
     * 解析 URL 為組件
     * @param {string} url
     * @returns {Object}
     */
    parseURL(url) {
        try {
            const urlObj = new URL(url);
            return {
                protocol: urlObj.protocol,
                host: urlObj.host,
                pathname: urlObj.pathname,
                search: urlObj.search,
                hash: urlObj.hash,
                searchParams: urlObj.searchParams
            };
        } catch (error) {
            // 備用解析方法
            const [baseURL, ...queryParts] = url.split('?');
            const search = queryParts.length > 0 ? '?' + queryParts.join('?') : '';
            const [cleanURL, hash] = baseURL.split('#');

            return {
                protocol: cleanURL.startsWith('https') ? 'https:' : 'http:',
                host: cleanURL.match(/\/\/([^\/]+)/)?.[1] || '',
                pathname: cleanURL.match(/\/\/[^\/]+(\/.*?)$/)?.[1] || '/',
                search: search.split('#')[0],
                hash: hash ? '#' + hash : '',
                searchParams: new URLSearchParams(search.substring(1))
            };
        }
    }

    /**
     * 轉換短網址 b23.tv → vxb23.tv
     * @param {Object} urlParts
     * @param {Object} extractedData
     * @returns {string}
     */
    convertShortURL(urlParts, extractedData) {
        const { shortCode } = extractedData;
        return `https://vxb23.tv/${shortCode}`;
    }

    /**
     * 轉換直播間 URL
     * @param {Object} urlParts
     * @param {Object} extractedData
     * @returns {string}
     */
    convertLiveURL(urlParts, extractedData) {
        const { roomId } = extractedData;
        return `https://live.vxbilibili.com/${roomId}`;
    }

    /**
     * 轉換普通 bilibili.com URL → vxbilibili.com
     * @param {Object} urlParts
     * @param {string} patternName
     * @param {Object} extractedData
     * @returns {string}
     */
    convertRegularURL(urlParts, patternName, extractedData) {
        // 將主機名轉換為 VX 格式
        let newHost = urlParts.host
            .replace(/^(www\.)?bilibili\.com$/i, 'www.vxbilibili.com')
            .replace(/^m\.bilibili\.com$/i, 'www.vxbilibili.com');

        // 處理移動端視頻 URL 的路徑轉換
        let newPath = urlParts.pathname;
        if (patternName === 'mobileShortUrl') {
            // m.bilibili.com/video/BV*** → www.vxbilibili.com/video/BV***
            newPath = urlParts.pathname; // 路徑保持不變
        }

        return `https://${newHost}${newPath}`;
    }

    /**
     * 處理 URL 參數，保留重要參數並處理語言設定
     * @param {string} search
     * @param {string} patternName
     * @returns {Object}
     */
    processURLParameters(search, patternName) {
        if (!search || search === '?') {
            return { finalParams: null, hasLanguageParam: false, preservedParams: {} };
        }

        const params = new URLSearchParams(search.substring(1));
        const preservedParams = {};
        let hasLanguageParam = false;

        // 定義需要保留的參數
        const importantParams = {
            'p': true,        // 分P參數 (視頻分集)
            't': true,        // 時間參數
            'spm_id_from': true, // B站追蹤參數
            'vd_source': true,   // 來源參數
            'lang': true,        // 語言參數
            'feature': true      // 功能參數
        };

        // 遍歷所有參數，保留重要的
        for (const [key, value] of params) {
            if (importantParams[key]) {
                preservedParams[key] = value;
                if (key === 'lang') {
                    hasLanguageParam = true;
                }
            }
        }

        // 構建最終參數字符串
        const finalParamsArray = [];
        for (const [key, value] of Object.entries(preservedParams)) {
            finalParamsArray.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }

        const finalParams = finalParamsArray.length > 0 ? finalParamsArray.join('&') : null;

        return {
            finalParams,
            hasLanguageParam,
            preservedParams
        };
    }

    /**
     * 檢查是否支援此 URL 類型
     * @param {string} patternName
     * @returns {boolean}
     */
    isSupported(patternName) {
        const supportedPatterns = [
            'video',           // 視頻頁面
            'column',          // 專欄文章
            'dynamic',         // 動態
            'space',           // 用戶空間
            'live',            // 直播間
            'shortUrl',        // b23.tv 短網址
            'mobileShortUrl'   // 移動端短網址
        ];
        return supportedPatterns.includes(patternName);
    }

    /**
     * 獲取支援的 URL 類型列表
     * @returns {string[]}
     */
    getSupportedPatterns() {
        return [
            'video',
            'column',
            'dynamic',
            'space',
            'live',
            'shortUrl',
            'mobileShortUrl'
        ];
    }

    /**
     * 驗證轉換結果
     * @param {string} originalURL
     * @param {string} convertedURL
     * @returns {boolean}
     */
    validateConversion(originalURL, convertedURL) {
        // 基本驗證：轉換後的 URL 應該包含 vx 前綴
        return convertedURL.includes('vx') &&
               (convertedURL.includes('vxbilibili.com') ||
                convertedURL.includes('vxb23.tv') ||
                convertedURL.includes('live.vxbilibili.com'));
    }
}

module.exports = BilibiliExtractor;
