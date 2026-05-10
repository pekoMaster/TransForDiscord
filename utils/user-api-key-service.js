/**
 * user-api-key-service.js（TransForDiscord v2）
 * 適配多廠商 API Key 儲存系統
 * 提供向下相容介面
 */

const { getKey, getAllKeys, hasAnyKey } = require('./user-api-key-storage.js');

let instance = null;

class UserApiKeyService {
    constructor() {
        // 系統 Gemini Keys（從環境變數載入，作為備用）
        this.geminiKeys = [];
        for (let i = 1; i <= 10; i++) {
            const key = process.env[`GOOGLE_GEMINI_API_KEY_${i}`];
            if (key) this.geminiKeys.push(key);
        }
        this._keyIndex = 0;
    }

    static getInstance() {
        if (!instance) instance = new UserApiKeyService();
        return instance;
    }

    /**
     * 取得用戶的 API Key（指定廠商）
     * @param {string} userId
     * @param {string} service - 'gemini' | 'openai' | 'claude'
     * @returns {string|null}
     */
    async getApiKey(userId, service = 'gemini') {
        // 優先使用用戶個人 Key
        if (userId) {
            const userKey = getKey(userId, service);
            if (userKey) return userKey;
        }

        // 回退到系統 Gemini Keys（僅 gemini 服務）
        if (service === 'gemini' && this.geminiKeys.length > 0) {
            const key = this.geminiKeys[this._keyIndex % this.geminiKeys.length];
            this._keyIndex++;
            return key;
        }

        return null;
    }

    async getUserApiKey(userId, service) {
        return this.getApiKey(userId, service);
    }
}

module.exports = { getInstance: UserApiKeyService.getInstance.bind(UserApiKeyService) };
