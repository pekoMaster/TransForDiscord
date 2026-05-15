/**
 * Compatibility adapter for older code that still asks for an API key service.
 * New translation flows should use utils/translation/key-resolver.js directly.
 */

const { getKey } = require('../keys/user-api-key-storage');
const { getEnvFallbackKey } = require('../keys/key-resolver');

let instance = null;

class UserApiKeyService {
    static getInstance() {
        if (!instance) instance = new UserApiKeyService();
        return instance;
    }

    async getApiKey(userId, service = 'gemini') {
        if (userId) {
            const userKey = getKey(userId, service);
            if (userKey) return userKey;
        }

        return getEnvFallbackKey(service);
    }

    async getUserApiKey(userId, service = 'gemini') {
        return this.getApiKey(userId, service);
    }
}

module.exports = { getInstance: UserApiKeyService.getInstance.bind(UserApiKeyService) };
