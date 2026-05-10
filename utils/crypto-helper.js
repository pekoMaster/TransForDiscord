/**
 * crypto-helper.js — AES-256-GCM 加解密工具
 *
 * 用途：保護儲存在 SQLite 的使用者 API Keys
 *
 * 格式：base64(iv(12 bytes) || authTag(16 bytes) || ciphertext)
 *
 * 主金鑰來源：
 *   1. 環境變數 TFD_ENCRYPTION_KEY（hex 格式，64 字元 = 32 bytes）
 *   2. 若未設定，啟動時自動產生並寫入 data/.encryption-key（檔案權限應為 0600）
 *      注意：此檔遺失將導致所有已加密 Key 無法還原。請定期備份。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const KEY_FILE = path.join(__dirname, '..', 'data', '.encryption-key');

let masterKey = null;

function _loadOrGenerateKey() {
    const envKey = process.env.TFD_ENCRYPTION_KEY;
    if (envKey) {
        const buf = Buffer.from(envKey, 'hex');
        if (buf.length !== KEY_LENGTH) {
            throw new Error(`TFD_ENCRYPTION_KEY 長度錯誤：需要 ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars)`);
        }
        return buf;
    }

    if (fs.existsSync(KEY_FILE)) {
        const hex = fs.readFileSync(KEY_FILE, 'utf8').trim();
        const buf = Buffer.from(hex, 'hex');
        if (buf.length !== KEY_LENGTH) {
            throw new Error(`金鑰檔案 ${KEY_FILE} 長度錯誤`);
        }
        return buf;
    }

    const dir = path.dirname(KEY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const buf = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(KEY_FILE, buf.toString('hex'), { mode: 0o600 });

    console.warn('[crypto-helper] 已自動產生新的加密金鑰並寫入 data/.encryption-key');
    console.warn('[crypto-helper] 請務必備份此檔案！遺失將導致所有已加密的 API Key 無法還原。');
    console.warn('[crypto-helper] 建議改設環境變數 TFD_ENCRYPTION_KEY 並刪除此檔以提升安全性。');

    return buf;
}

function _getMasterKey() {
    if (!masterKey) masterKey = _loadOrGenerateKey();
    return masterKey;
}

/**
 * 加密字串
 * @param {string} plaintext
 * @returns {string} base64(iv || authTag || ciphertext)
 */
function encrypt(plaintext) {
    if (typeof plaintext !== 'string') {
        throw new TypeError('encrypt: plaintext must be a string');
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, _getMasterKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * 解密字串
 * @param {string} encoded
 * @returns {string} plaintext
 */
function decrypt(encoded) {
    if (typeof encoded !== 'string') {
        throw new TypeError('decrypt: encoded must be a string');
    }
    const buf = Buffer.from(encoded, 'base64');
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('decrypt: 資料長度不足，可能已損毀');
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGO, _getMasterKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
}

function secureEqual(a, b) {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

/**
 * 產生 API Key 的部分遮罩字串（顯示用）
 * 例：sk-proj-abcdef123456 → sk-proj-ab••••3456
 */
function maskKey(key) {
    if (!key || key.length < 8) return '••••';
    const head = key.slice(0, Math.min(10, Math.floor(key.length / 4)));
    const tail = key.slice(-4);
    return `${head}••••${tail}`;
}

module.exports = {
    encrypt,
    decrypt,
    secureEqual,
    maskKey,
    _resetForTesting: () => { masterKey = null; }
};
