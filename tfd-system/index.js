/**
 * TFD 系統 - 主入口
 * 連結預覽增強系統
 */

const config = require('./config/tfd-config.json');

class TFDSystem {
    constructor() {
        this.messageHandler = null; // 延遲初始化，避免重複載入提取器
        this.config = config;
        this.initialized = false;
        this.stats = {
            startTime: new Date(),
            processedMessages: 0,
            successfulPreviews: 0,
            errors: 0
        };
    }

    /**
     * 初始化 TFD 系統
     * @returns {Promise<boolean>}
     */
    async initialize() {
        try {
            console.log('[TFD] 正在初始化 TFD 連結預覽系統...');

            // 檢查配置
            if (!this.validateConfig()) {
                throw new Error('配置檔案無效');
            }

            // 檢查依賴
            await this.checkDependencies();

            this.initialized = true;
            console.log('[TFD] TFD 系統初始化完成');

            return true;
        } catch (error) {
            console.error(`[TFD] ❌ 初始化失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 處理 Discord 訊息
     * @param {Object} message Discord 訊息物件
     * @returns {Promise<Object[]>}
     */
    _getMessageHandler() {
        if (!this.messageHandler) {
            const MessageHandler = require('./core/message-handler-v2');
            this.messageHandler = new MessageHandler();
        }
        return this.messageHandler;
    }

    async processMessage(message) {
        if (!this.initialized) {
            console.warn('[TFD] 系統尚未初始化');
            return [];
        }

        if (!this.config.enabled) {
            return [];
        }

        try {
            this.stats.processedMessages++;
            const results = await this._getMessageHandler().handleMessage(message);

            if (results.length > 0) {
                this.stats.successfulPreviews += results.length;
            }

            return results;
        } catch (error) {
            this.stats.errors++;
            console.error(`[TFD] 處理訊息失敗: ${error.message}`);
            return [];
        }
    }

    /**
     * 處理訊息更新事件
     * @param {Object} oldMessage
     * @param {Object} newMessage
     * @returns {Promise<Object[]>}
     */
    async processMessageUpdate(oldMessage, newMessage) {
        if (!this.initialized || !this.config.enabled) {
            return [];
        }

        try {
            return await this._getMessageHandler().handleMessageUpdate(oldMessage, newMessage);
        } catch (error) {
            this.stats.errors++;
            console.error(`[TFD] 處理訊息更新失敗: ${error.message}`);
            return [];
        }
    }

    /**
     * 驗證配置
     * @returns {boolean}
     */
    validateConfig() {
        if (!this.config) {
            console.error('[TFD] 配置檔案未載入');
            return false;
        }

        const requiredFields = ['version', 'enabled', 'settings'];
        for (const field of requiredFields) {
            if (!(field in this.config)) {
                console.error(`[TFD] 配置缺少必要欄位: ${field}`);
                return false;
            }
        }

        return true;
    }

    /**
     * 檢查依賴
     * @returns {Promise<void>}
     */
    async checkDependencies() {
        const dependencies = ['axios', 'cheerio'];

        for (const dep of dependencies) {
            try {
                require(dep);
            } catch (error) {
                throw new Error(`缺少依賴: ${dep}`);
            }
        }

        console.log('[TFD] ✅ 所有依賴檢查通過');
    }

    /**
     * 取得支援的網站清單
     * @returns {string[]}
     */
    getSupportedSites() {
        return this._getMessageHandler().linkProcessor.extractorManager.getSupportedSites();
    }

    /**
     * 檢查 URL 是否被支援
     * @param {string} url
     * @returns {boolean}
     */
    isURLSupported(url) {
        const matchResult = this._getMessageHandler().linkProcessor.urlMatcher.matchURL(url);
        return matchResult !== null;
    }

    /**
     * 啟用系統
     */
    enable() {
        this.config.enabled = true;
        console.log('[TFD] ✅ 系統已啟用');
    }

    /**
     * 停用系統
     */
    disable() {
        this.config.enabled = false;
        console.log('[TFD] ⏸️ 系統已停用');
    }

    /**
     * 重新載入配置
     * @returns {boolean}
     */
    reloadConfig() {
        try {
            delete require.cache[require.resolve('./config/tfd-config.json')];
            this.config = require('./config/tfd-config.json');
            if (this.messageHandler) this.messageHandler.reloadConfig();
            console.log('[TFD] 🔄 配置已重新載入');
            return true;
        } catch (error) {
            console.error(`[TFD] 重新載入配置失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 清空快取和處理記錄
     */
    clearCache() {
        if (this.messageHandler) this.messageHandler.clearProcessedMessages();
        console.log('[TFD] 🧹 快取已清空');
    }

    /**
     * 取得系統統計
     * @returns {Object}
     */
    getStats() {
        const messageHandlerStats = this.messageHandler ? this.messageHandler.getStats() : {};

        return {
            system: {
                initialized: this.initialized,
                enabled: this.config.enabled,
                version: this.config.version,
                uptime: Date.now() - this.stats.startTime.getTime(),
                ...this.stats
            },
            messageHandler: messageHandlerStats,
            supportedSites: this.getSupportedSites(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 取得系統狀態
     * @returns {Object}
     */
    getStatus() {
        return {
            name: 'TFD 連結預覽系統',
            version: this.config.version,
            status: this.initialized ? (this.config.enabled ? 'running' : 'disabled') : 'not_initialized',
            supportedSites: this.getSupportedSites().length,
            uptime: Date.now() - this.stats.startTime.getTime(),
            stats: {
                processedMessages: this.stats.processedMessages,
                successfulPreviews: this.stats.successfulPreviews,
                errorRate: this.stats.processedMessages > 0 ?
                    (this.stats.errors / this.stats.processedMessages * 100).toFixed(2) + '%' : '0%'
            }
        };
    }

    /**
     * 檢查系統健康狀態
     * @returns {Object}
     */
    healthCheck() {
        const messageHandlerHealth = this.messageHandler ? this.messageHandler.healthCheck() : { status: 'not_loaded' };

        return {
            status: this.initialized && this.config.enabled ? 'healthy' : 'degraded',
            system: {
                initialized: this.initialized,
                enabled: this.config.enabled,
                configValid: this.validateConfig()
            },
            components: {
                messageHandler: messageHandlerHealth
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 優雅關閉系統
     */
    async shutdown() {
        console.log('[TFD] 🔄 正在關閉 TFD 系統...');

        this.clearCache();
        this.initialized = false;

        console.log('[TFD] ✅ TFD 系統已關閉');
    }
}

// 建立單例
const ermianaSystem = new TFDSystem();

module.exports = ermianaSystem;