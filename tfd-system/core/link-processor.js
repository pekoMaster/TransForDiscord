/**
 * TFD 系統 - 連結處理器
 * 處理訊息中的連結並協調各個組件
 */

const URLMatcher = require('../regex/matcher');
const ExtractorManager = require('../extractors');
const { loadTfdConfig, reloadTfdConfig } = require('../../src/core/config/config-loader');
const linkSupport = require('../../src/features/link-support/link-support-service');
const tfd = require('../../utils/tfd-logger');

class LinkProcessor {
    constructor() {
        this.urlMatcher = new URLMatcher();
        this.extractorManager = new ExtractorManager();
        this.config = loadTfdConfig();
        this.processedCache = new Map(); // 簡單的處理快取
        this.rateLimitMap = new Map(); // 速率限制
    }

    /**
     * 處理訊息中的所有連結
     * @param {Object} message Discord 訊息物件
     * @returns {Promise<Object[]>}
     */
    async processMessage(message) {
        const content = message.content || '';
        const results = [];

        try {
            // 檢查是否啟用
            if (!this.config.enabled) {
                return [];
            }

            // 檢查頻道限制
            const guildId = message.guildId || message.guild?.id || null;
            if (!this.isChannelAllowed(message.channel.id, guildId)) {
                return [];
            }

            // 檢查用戶速率限制
            if (!this.checkRateLimit(message.author.id)) {
                tfd.sys('TFD-LinkProcessor', `用戶 ${message.author.id} 觸發速率限制`);
                return [];
            }

            // 提取所有 URL
            const urls = this.urlMatcher.extractURLs(content);
            if (urls.length === 0) {
                return [];
            }

            // 成功時不顯示處理連結數量

            // 處理每個 URL
            for (const url of urls) {
                try {
                    const result = await this.processSingleURL(url, message);
                    if (result) {
                        // 確保每個 result 都帶有對應的原始 URL
                        // 避免多個 URL 的訊息在 Webhook 標題都顯示第一個 URL
                        if (!result.originalURL && !result.url) {
                            result.originalURL = url;
                        }
                        results.push(result);
                    }
                } catch (error) {
                    tfd.sysError('TFD-LinkProcessor', `處理 URL 失敗: ${url} - ${error.message}`);
                    // 繼續處理其他 URL
                }
            }

            return results;

        } catch (error) {
            tfd.sysError('TFD-LinkProcessor', `處理訊息失敗: ${error.message}`);
            return [];
        }
    }

    /**
     * 處理單個 URL
     * @param {string} url
     * @param {Object} message
     * @returns {Promise<Object|null>}
     */
    async processSingleURL(url, message) {
        // 匹配 URL 模式
        const matchResult = this.urlMatcher.matchURL(url);
        if (!matchResult) {
            // 靜默跳過不支援的 URL，不記錄日誌避免干擾
            return null;
        }

        // 檢查網站是否啟用
        const guildId = message?.guildId || message?.guild?.id || null;
        if (!this.isSiteEnabled(matchResult.siteName, guildId, url)) {
            tfd.sys('TFD-LinkProcessor', `網站已停用: ${matchResult.siteName}`);
            return null;
        }

        const cacheKey = guildId ? `${guildId}:${url}` : url;
        if (this.processedCache.has(cacheKey)) {
            const cached = this.processedCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 300000) { // 5分鐘快取
                // 如果快取結果是 null 或有錯誤，清除快取重新處理
                if (!cached.result || (cached.result && cached.result.success === false)) {
                    tfd.sys('TFD-LinkProcessor', `清除無效快取: ${url}`);
                    this.processedCache.delete(cacheKey);
                } else {
                    tfd.sys('TFD-LinkProcessor', `使用快取結果: ${url}`);
                    return cached.result;
                }
            }
        }

        // 使用提取器處理
        try {
            const result = await this.extractorManager.extract(matchResult, message);

            // 快取結果
            this.processedCache.set(cacheKey, {
                result: result,
                timestamp: Date.now()
            });

            // 清理舊快取
            this.cleanupCache();

            // 成功時不顯示處理詳情
            return result;

        } catch (error) {
            tfd.sysError('TFD-LinkProcessor', `提取失敗: ${matchResult.siteName} - ${error.message}`);
            return null;
        }
    }

    /**
     * 檢查頻道是否允許處理（per-guild）
     * @param {string} channelId
     * @param {string} [guildId] - 必填於公開版；舊版相容性保留為 optional
     * @returns {boolean}
     */
    isChannelAllowed(channelId, guildId = null) {
        // 公開版：只用 per-guild blocked channels（不再支援全域 allowedChannels）
        if (!guildId) return true;
        const db = require('../../db');
        return !db.blockedChannels.has(guildId, channelId);
    }

    /**
     * 檢查網站是否啟用
     * @param {string} siteName
     * @returns {boolean}
     */
    isSiteEnabled(siteName, guildId = null, url = null) {
        if (!this.extractorManager.isSupported(siteName)) return false;
        if (!guildId || !url) return true;
        return linkSupport.isDomainEnabled(guildId, url);
    }

    /**
     * 檢查用戶速率限制
     * @param {string} userId
     * @returns {boolean}
     */
    checkRateLimit(userId) {
        const now = Date.now();
        const rateLimit = this.config.rateLimit;

        if (!this.rateLimitMap.has(userId)) {
            this.rateLimitMap.set(userId, {
                requests: [],
                lastReset: now
            });
        }

        const userData = this.rateLimitMap.get(userId);

        // 重置計數器（每分鐘）
        if (now - userData.lastReset > 60000) {
            userData.requests = [];
            userData.lastReset = now;
        }

        // 移除舊請求
        userData.requests = userData.requests.filter(time => now - time < 60000);

        // 檢查是否超過限制
        if (userData.requests.length >= rateLimit.requestsPerUser) {
            return false;
        }

        // 記錄新請求
        userData.requests.push(now);
        return true;
    }

    /**
     * 清理過期快取
     */
    cleanupCache() {
        const now = Date.now();
        const expireTime = 300000; // 5分鐘

        for (const [url, cached] of this.processedCache.entries()) {
            if (now - cached.timestamp > expireTime) {
                this.processedCache.delete(url);
            }
        }
    }

    /**
     * 取得處理統計
     * @returns {Object}
     */
    getStats() {
        return {
            cacheSize: this.processedCache.size,
            rateLimitedUsers: this.rateLimitMap.size,
            supportedSites: this.extractorManager.getSupportedSites(),
            config: {
                enabled: this.config.enabled,
                allowedChannels: this.config.settings.allowedChannels.length,
                blockedChannels: this.config.settings.blockedChannels.length
            }
        };
    }

    /**
     * 清空快取
     */
    clearCache() {
        this.processedCache.clear();
        tfd.sys('TFD-LinkProcessor', '快取已清空');
    }

    /**
     * 重新載入配置
     */
    reloadConfig() {
        try {
            this.config = reloadTfdConfig();
            tfd.sys('TFD-LinkProcessor', '配置已重新載入');
            return true;
        } catch (error) {
            tfd.sysError('TFD-LinkProcessor', `重新載入配置失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 檢查系統健康狀態
     * @returns {Object}
     */
    healthCheck() {
        return {
            status: 'healthy',
            config: {
                loaded: this.config !== null,
                enabled: this.config.enabled
            },
            extractors: this.extractorManager.getStats(),
            cache: {
                size: this.processedCache.size,
                rateLimitedUsers: this.rateLimitMap.size
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = LinkProcessor;
