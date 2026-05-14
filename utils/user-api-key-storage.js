/**
 * user-api-key-storage.js
 *
 * 使用者個人 AI API Key 儲存層
 * 後端：SQLite (db/index.js) + AES-256-GCM 加密 (utils/crypto-helper.js)
 *
 * API 與舊版 JSON 版相容：saveKey / getKey / removeKey / hasKey / getKeyStatus / getAllKeys / hasAnyKey
 */

const db = require('../db');
const { encrypt, decrypt } = require('./crypto-helper.js');
const tfd = require('./tfd-logger');

// 支援的 AI 廠商（保留與舊版一致）
const PROVIDERS = {
    openai:      { name: 'OpenAI',             prefix: 'sk-',     placeholder: 'sk-proj-...' },
    claude:      { name: 'Claude (Anthropic)', prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
    gemini:      { name: 'Gemini (Google)',     prefix: 'AIza',    placeholder: 'AIzaSy...' },
    openrouter:  { name: 'OpenRouter',          prefix: 'sk-or-',  placeholder: 'sk-or-v1-...' }
};

const VALID_PROVIDERS = new Set(Object.keys(PROVIDERS));

function _ensureProvider(provider) {
    if (!VALID_PROVIDERS.has(provider)) {
        throw new Error(`未知的 provider: ${provider}（合法值：${[...VALID_PROVIDERS].join(', ')}）`);
    }
}

/**
 * 儲存使用者的 API Key（自動加密）
 */
function saveKey(userId, provider, apiKey) {
    _ensureProvider(provider);
    if (typeof apiKey !== 'string' || !apiKey) {
        throw new Error('apiKey 必須是非空字串');
    }
    const encrypted = encrypt(apiKey);
    db.apiKeys.upsert(userId, provider, encrypted, 1);
}

/**
 * 取得使用者指定廠商的 API Key（解密後回傳）
 * @returns {string|null} 明文 key，未設定時回傳 null
 */
function getKey(userId, provider) {
    _ensureProvider(provider);
    const row = db.apiKeys.get(userId, provider);
    if (!row) return null;
    try {
        const plain = decrypt(row.encrypted_key);
        // 順手更新 last_used_at
        db.apiKeys.touchUsed(userId, provider);
        return plain;
    } catch (e) {
        tfd.sysError('UserApiKey', `解密失敗 user=${userId} provider=${provider}: ${e.message}`);
        return null;
    }
}

/**
 * 取得使用者所有已設定的 API Keys（明文，僅供翻譯引擎使用）
 * @returns {Object} { openai?: string, claude?: string, gemini?: string }
 */
function getAllKeys(userId) {
    const result = {};
    const providers = db.apiKeys.listProviders(userId);
    for (const p of providers) {
        const k = getKey(userId, p);
        if (k) result[p] = k;
    }
    return result;
}

/**
 * 取得使用者的 Key 設定狀態（不回傳值）
 * @returns {Object} { openai: boolean, claude: boolean, gemini: boolean, openrouter: boolean }
 */
function getKeyStatus(userId) {
    const providers = new Set(db.apiKeys.listProviders(userId));
    return {
        openai:     providers.has('openai'),
        claude:     providers.has('claude'),
        gemini:     providers.has('gemini'),
        openrouter: providers.has('openrouter')
    };
}

/**
 * 移除使用者指定廠商的 API Key
 * @returns {boolean} 是否成功移除
 */
function removeKey(userId, provider) {
    _ensureProvider(provider);
    return db.apiKeys.delete(userId, provider);
}

/**
 * 檢查使用者是否有任何 API Key
 */
function hasAnyKey(userId) {
    return db.apiKeys.listProviders(userId).length > 0;
}

/**
 * 檢查使用者是否有指定廠商的 Key（provider 可省略 = 任一）
 */
function hasKey(userId, provider) {
    if (provider) {
        _ensureProvider(provider);
        return !!db.apiKeys.get(userId, provider);
    }
    return hasAnyKey(userId);
}

/**
 * 取得使用者偏好的翻譯廠商
 * @returns {string|null} provider key，未設定時回傳 null
 */
function getPreferredProvider(userId) {
    return db.userPrefs.getProvider(userId);
}

/**
 * 設定使用者偏好的翻譯廠商
 */
function setPreferredProvider(userId, provider) {
    _ensureProvider(provider);
    return db.userPrefs.setProvider(userId, provider);
}

module.exports = {
    PROVIDERS,
    saveKey,
    getKey,
    getKeyStatus,
    getAllKeys,
    removeKey,
    hasAnyKey,
    hasKey,
    getPreferredProvider,
    setPreferredProvider
};
