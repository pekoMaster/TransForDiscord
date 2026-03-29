/**
 * Ermiana 系統 - HTTP 客戶端
 * 統一的 HTTP 請求處理
 */

const axios = require('axios');
const config = require('../config/ermiana-config.json');

class HTTPClient {
    constructor() {
        this.timeout = config.settings.timeout;
        this.userAgent = config.settings.userAgent;
        this.maxRetries = config.settings.maxRetries;
        this.maxContentLength = config.settings.maxContentLength;

        // 建立 axios 實例
        this.client = axios.create({
            timeout: this.timeout,
            maxContentLength: this.maxContentLength,
            headers: {
                'User-Agent': this.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
    }

    /**
     * 執行 HTTP GET 請求
     * @param {string} url
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async get(url, options = {}) {
        const config = {
            method: 'GET',
            url: url,
            ...options
        };

        return this.request(config);
    }

    /**
     * 執行 HTTP 請求（含重試機制）
     * @param {Object} config
     * @returns {Promise<Object>}
     */
    async request(config) {
        let lastError;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await this.client(config);

                return {
                    success: true,
                    data: response.data,
                    status: response.status,
                    headers: response.headers,
                    url: response.config.url
                };

            } catch (error) {
                lastError = error;

                // 記錄失敗
                this.log(`HTTP請求失敗: ${config.url} (嘗試 ${attempt}/${this.maxRetries}) - ${error.message}`, 'error');

                // 如果不是最後一次嘗試，等待後重試
                if (attempt < this.maxRetries) {
                    const delay = this.calculateBackoff(attempt);
                    await this.sleep(delay);
                }
            }
        }

        // 所有重試都失敗
        return {
            success: false,
            error: lastError.message,
            status: lastError.response?.status || 0,
            url: config.url
        };
    }

    /**
     * 取得網頁 HTML 內容
     * @param {string} url
     * @returns {Promise<string|null|Object>}
     */
    async fetchHTML(url) {
        const result = await this.get(url);

        if (result.success) {
            return result.data;
        } else {
            this.log(`無法取得 HTML: ${url} - ${result.error}`, 'error');
            // 🔧 返回錯誤資訊物件（包含 HTTP 狀態碼）
            return { error: true, status: result.status, message: result.error };
        }
    }

    /**
     * 取得 JSON 資料
     * @param {string} url
     * @returns {Promise<Object|null>}
     */
    async fetchJSON(url) {
        const result = await this.get(url, {
            headers: {
                'Accept': 'application/json, text/plain, */*'
            }
        });

        if (result.success) {
            try {
                return typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
            } catch (parseError) {
                this.log(`JSON 解析失敗: ${url} - ${parseError.message}`, 'error');
                return null;
            }
        } else {
            this.log(`無法取得 JSON: ${url} - ${result.error}`, 'error');
            return null;
        }
    }

    /**
     * 檢查 URL 是否可存取
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    async checkURL(url) {
        try {
            const response = await this.client.head(url);
            return response.status >= 200 && response.status < 400;
        } catch (error) {
            return false;
        }
    }

    /**
     * 計算退避延遲時間
     * @param {number} attempt
     * @returns {number}
     */
    calculateBackoff(attempt) {
        // 指數退避：1秒、2秒、4秒
        return Math.min(1000 * Math.pow(2, attempt - 1), 5000);
    }

    /**
     * 休眠函數
     * @param {number} ms
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 日誌記錄
     * @param {string} message
     * @param {string} level
     */
    log(message, level = 'info') {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const prefix = `[${hours}:${minutes}] [Ermiana-HTTP]`;

        if (level === 'error') {
            console.error(`${prefix} ❌ ${message}`);
        } else {
            console.log(`${prefix} 🌐 ${message}`);
        }
    }
}

module.exports = HTTPClient;