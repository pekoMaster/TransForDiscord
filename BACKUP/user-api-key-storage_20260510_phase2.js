/**
 * user-api-key-storage.js
 * 儲存用戶個人 AI API Key（支援多廠商：OpenAI / Claude / Gemini）
 * 儲存格式：{ userId: { openai: "sk-...", claude: "sk-ant-...", gemini: "AIza..." } }
 * Key 只有儲存時本人輸入可見，之後無法讀回顯示
 */

const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, '../data/user-api-keys.json');

// 支援的 AI 廠商
const PROVIDERS = {
    openai: { name: 'OpenAI', prefix: 'sk-', placeholder: 'sk-proj-...' },
    claude: { name: 'Claude (Anthropic)', prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
    gemini: { name: 'Gemini (Google)', prefix: 'AIza', placeholder: 'AIzaSy...' }
};

function _load() {
    try {
        if (!fs.existsSync(STORAGE_FILE)) return {};
        return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function _save(data) {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 儲存用戶的 API Key
 * @param {string} userId - Discord 用戶 ID
 * @param {string} provider - 廠商名稱 (openai/claude/gemini)
 * @param {string} apiKey - API Key 值
 */
function saveKey(userId, provider, apiKey) {
    const keys = _load();
    if (!keys[userId]) keys[userId] = {};
    keys[userId][provider] = apiKey;
    _save(keys);
}

/**
 * 取得用戶指定廠商的 API Key
 * @param {string} userId
 * @param {string} provider
 * @returns {string|null}
 */
function getKey(userId, provider) {
    const keys = _load();
    return keys[userId]?.[provider] || null;
}

/**
 * 取得用戶所有已設定的 API Key（只回傳哪些廠商有設定，不回傳 Key 值）
 * @param {string} userId
 * @returns {Object} { openai: boolean, claude: boolean, gemini: boolean }
 */
function getKeyStatus(userId) {
    const keys = _load();
    const userKeys = keys[userId] || {};
    return {
        openai: !!userKeys.openai,
        claude: !!userKeys.claude,
        gemini: !!userKeys.gemini
    };
}

/**
 * 取得用戶所有已設定的 API Keys（回傳實際 Key 值，僅供翻譯引擎使用）
 * @param {string} userId
 * @returns {Object} { openai?: string, claude?: string, gemini?: string }
 */
function getAllKeys(userId) {
    const keys = _load();
    return keys[userId] || {};
}

/**
 * 移除用戶指定廠商的 API Key
 * @param {string} userId
 * @param {string} provider
 * @returns {boolean} 是否成功移除
 */
function removeKey(userId, provider) {
    const keys = _load();
    if (!keys[userId] || !keys[userId][provider]) return false;
    delete keys[userId][provider];
    // 如果用戶沒有任何 Key 了，清除整個用戶記錄
    if (Object.keys(keys[userId]).length === 0) {
        delete keys[userId];
    }
    _save(keys);
    return true;
}

/**
 * 檢查用戶是否有任何 API Key
 * @param {string} userId
 * @returns {boolean}
 */
function hasAnyKey(userId) {
    const status = getKeyStatus(userId);
    return status.openai || status.claude || status.gemini;
}

/**
 * 檢查用戶是否有指定廠商的 Key
 * @param {string} userId
 * @param {string} provider
 * @returns {boolean}
 */
function hasKey(userId, provider) {
    if (provider) {
        return !!getKey(userId, provider);
    }
    return hasAnyKey(userId);
}

module.exports = {
    PROVIDERS,
    saveKey,
    getKey,
    getKeyStatus,
    getAllKeys,
    removeKey,
    hasAnyKey,
    hasKey
};
