/**
 * user-api-key-service.js（TransForDiscord 精簡版）
 * 優先使用用戶個人 Key，再回退到環境變數 Key
 */

const { getKey } = require('./user-api-key-storage.js');

let instance = null;

class UserApiKeyService {
    constructor() {
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

    async getApiKey(userId, service = 'gemini') {
        // 優先使用用戶個人 Key
        if (userId) {
            const userKey = getKey(userId);
            if (userKey) return userKey;
        }
        // 回退到環境變數 Key（輪流使用）
        if (this.geminiKeys.length === 0) return null;
        const key = this.geminiKeys[this._keyIndex % this.geminiKeys.length];
        this._keyIndex++;
        return key;
    }

    async getUserApiKey(userId, service) {
        return this.getApiKey(userId, service);
    }
}

module.exports = { getInstance: UserApiKeyService.getInstance.bind(UserApiKeyService) };
