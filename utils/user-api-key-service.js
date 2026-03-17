/**
 * user-api-key-service.js（TransForDiscord 精簡版）
 * 從環境變數讀取 Gemini API Key，無資料庫依賴
 */

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
