/**
 * user-api-key-storage.js
 * 儲存用戶個人 Gemini API Key（存在本地 JSON，不上傳 git）
 * Key 只有儲存時本人輸入可見，之後無法讀回顯示
 */

const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, '../data/user-api-keys.json');

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
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data), 'utf8');
}

function saveKey(userId, apiKey) {
    const keys = _load();
    keys[userId] = apiKey;
    _save(keys);
}

function getKey(userId) {
    return _load()[userId] || null;
}

function removeKey(userId) {
    const keys = _load();
    if (!keys[userId]) return false;
    delete keys[userId];
    _save(keys);
    return true;
}

function hasKey(userId) {
    return !!_load()[userId];
}

module.exports = { saveKey, getKey, removeKey, hasKey };
