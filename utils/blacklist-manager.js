/**
 * 黑名單管理工具
 * 管理 PTT 和 Twitter 的作者黑名單
 * Twitter 黑名單使用 UID（數字 ID）作為主要比對鍵，防止改名規避
 */

const fs = require('fs');
const path = require('path');
const tfd = require('./tfd-logger');

class BlacklistManager {
    constructor() {
        this.cache = new Map();
        this.cacheTimestamps = new Map(); // 記錄快取建立時間
        this.cacheMaxAge = 60000; // 快取有效期：60 秒
        this.basePath = path.join(__dirname, '..', 'data', 'link');
    }

    /**
     * 取得時間前綴
     * @returns {string}
     */
    getTimePrefix() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `[${hours}:${minutes}]`;
    }

    /**
     * 統一日誌輸出
     * @param {string} message
     * @param {string} level - 'info' 或 'error'
     */
    log(message, level = 'info') {
        const prefix = `${this.getTimePrefix()} [BlacklistManager]`;
        if (level === 'error') {
            tfd.sysError('Blacklist', `${prefix} ${message}`);
        } else {
            tfd.sys('Blacklist', `${prefix} ${message}`);
        }
    }

    /**
     * 取得黑名單檔案路徑
     * @param {string} platform - 平台名稱 (ptt, twitter)
     * @returns {string}
     */
    getFilePath(platform) {
        return path.join(this.basePath, platform.toLowerCase(), 'black_list.json');
    }

    /**
     * 載入黑名單
     * @param {string} platform - 平台名稱
     * @returns {Promise<Array>}
     */
    async load(platform) {
        const cacheKey = platform.toLowerCase();
        const now = Date.now();

        // 檢查快取是否存在且未過期
        if (this.cache.has(cacheKey) && this.cacheTimestamps.has(cacheKey)) {
            const cacheAge = now - this.cacheTimestamps.get(cacheKey);
            if (cacheAge < this.cacheMaxAge) {
                // 快取仍然有效
                return this.cache.get(cacheKey);
            }
            // 快取已過期，重新載入
        }

        try {
            const filePath = this.getFilePath(platform);

            // 檢查檔案是否存在
            if (!fs.existsSync(filePath)) {
                this.log(`黑名單檔案不存在，建立新檔案: ${filePath}`);
                // 建立目錄
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                // 建立空的黑名單檔案
                fs.writeFileSync(filePath, JSON.stringify({ blacklist: [] }, null, 2));
                this.cache.set(cacheKey, []);
                this.cacheTimestamps.set(cacheKey, now);
                return [];
            }

            // 讀取檔案
            const data = fs.readFileSync(filePath, 'utf8');
            const json = JSON.parse(data);
            const blacklist = json.blacklist || [];

            // 儲存到快取並記錄時間
            this.cache.set(cacheKey, blacklist);
            this.cacheTimestamps.set(cacheKey, now);

            return blacklist;
        } catch (error) {
            this.log(`載入黑名單失敗 (${platform}): ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * 儲存黑名單
     * @param {string} platform - 平台名稱
     * @param {Array} blacklist - 黑名單陣列
     * @returns {Promise<boolean>}
     */
    async save(platform, blacklist) {
        try {
            const filePath = this.getFilePath(platform);
            const data = {
                blacklist: blacklist,
                lastModified: new Date().toISOString()
            };

            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

            // 更新快取
            const cacheKey = platform.toLowerCase();
            this.cache.set(cacheKey, blacklist);

            this.log(`儲存 ${platform} 黑名單: ${blacklist.length} 筆`);
            return true;
        } catch (error) {
            this.log(`儲存黑名單失敗 (${platform}): ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * 檢查作者是否在黑名單中
     * Twitter 平台支援 UID 比對：優先用 UID，再用 username 回退
     * @param {string} platform - 平台名稱
     * @param {string} author - 作者 ID（username）
     * @param {string} [uid] - Twitter UID（數字 ID），僅 Twitter 平台使用
     * @returns {Promise<Object|null>}
     */
    async check(platform, author, uid = null) {
        const blacklist = await this.load(platform);

        // 如果有 UID，優先用 UID 比對（防止改名規避）
        if (uid) {
            const uidEntry = blacklist.find(item => item.uid && item.uid === uid);
            if (uidEntry) return uidEntry;
        }

        // 回退到 username 比對
        const entry = blacklist.find(item => item.author === author);
        return entry || null;
    }

    /**
     * 新增黑名單項目
     * @param {string} platform - 平台名稱
     * @param {string} author - 作者 ID（username）
     * @param {string} label - 警告標記
     * @param {number} level - 警告等級 (1, 2, 3)
     * @param {string} [uid] - Twitter UID（數字 ID），僅 Twitter 平台使用
     * @returns {Promise<boolean>}
     */
    async add(platform, author, label, level, uid = null) {
        try {
            const blacklist = await this.load(platform);

            // 構建新項目
            const newEntry = { author, label, level };
            if (uid) newEntry.uid = uid;

            // 檢查是否已存在（優先 UID 比對，再 username）
            let existingIndex = -1;
            if (uid) {
                existingIndex = blacklist.findIndex(item => item.uid && item.uid === uid);
            }
            if (existingIndex === -1) {
                existingIndex = blacklist.findIndex(item => item.author === author);
            }

            if (existingIndex !== -1) {
                // 更新現有項目
                blacklist[existingIndex] = newEntry;
                this.log(`更新黑名單項目: ${author}${uid ? ` (UID: ${uid})` : ''} (等級 ${level})`);
            } else {
                // 新增項目
                blacklist.push(newEntry);
                this.log(`新增黑名單項目: ${author}${uid ? ` (UID: ${uid})` : ''} (等級 ${level})`);
            }

            return await this.save(platform, blacklist);
        } catch (error) {
            this.log(`新增黑名單失敗: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * 移除黑名單項目
     * 支援 username 或 UID 匹配
     * @param {string} platform - 平台名稱
     * @param {string} identifier - 作者 ID（username）或 UID
     * @returns {Promise<boolean>}
     */
    async remove(platform, identifier) {
        try {
            const blacklist = await this.load(platform);
            const filteredList = blacklist.filter(item =>
                item.author !== identifier && (!item.uid || item.uid !== identifier)
            );

            if (filteredList.length === blacklist.length) {
                this.log(`黑名單中找不到: ${identifier}`);
                return false;
            }

            this.log(`移除黑名單項目: ${identifier}`);
            return await this.save(platform, filteredList);
        } catch (error) {
            this.log(`移除黑名單失敗: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * 清除快取
     * @param {string} platform - 平台名稱（可選）
     */
    clearCache(platform = null) {
        if (platform) {
            const cacheKey = platform.toLowerCase();
            this.cache.delete(cacheKey);
            this.cacheTimestamps.delete(cacheKey);
            this.log(`清除 ${platform} 快取`);
        } else {
            this.cache.clear();
            this.cacheTimestamps.clear();
            this.log(`清除所有快取`);
        }
    }

    /**
     * 取得黑名單列表
     * @param {string} platform - 平台名稱
     * @returns {Promise<Array>}
     */
    async list(platform) {
        return await this.load(platform);
    }

    /**
     * 從 Twitter/X 用戶名解析 UID（數字 ID）
     * 使用 Syndication API（公開，不需要 Token）
     * @param {string} username - Twitter 用戶名（不含 @）
     * @returns {Promise<string|null>} UID 字串或 null
     */
    static async resolveTwitterUid(username) {
        try {
            // 使用 vxtwitter API 來取得使用者資訊 (包含 UID)
            const url = `https://api.vxtwitter.com/${username}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!response.ok) return null;

            const data = await response.json();
            
            if (data && data.id) {
                return data.id.toString();
            }

            return null;
        } catch (error) {
            tfd.sysError('BlacklistManager', `resolveTwitterUid 失敗 (${username}): ${error.message}`);
            return null;
        }
    }

    /**
     * 從 Twitter/X URL 中提取用戶名
     * 支援格式：https://x.com/username, https://twitter.com/username
     * @param {string} input - URL 或用戶名
     * @returns {string} 用戶名（不含 @）
     */
    static extractTwitterUsername(input) {
        // 移除前後空白
        input = input.trim();

        // 移除開頭的 @
        if (input.startsWith('@')) {
            return input.slice(1);
        }

        // 嘗試從 URL 提取
        const urlMatch = input.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/i);
        if (urlMatch) {
            return urlMatch[1];
        }

        // 直接當作用戶名
        return input;
    }

    /**
     * 從 Pixiv URL 或 ID 中提取類型與 ID
     * 支援格式：
     *   https://www.pixiv.net/users/8315373  → { type: 'user', id: '8315373' }
     *   https://www.pixiv.net/artworks/137693594 → { type: 'artwork', id: '137693594' }
     *   user:8315373 → { type: 'user', id: '8315373' }
     *   artwork:137693594 → { type: 'artwork', id: '137693594' }
     *   8315373 (純數字) → { type: 'user', id: '8315373' } (預設為用戶 ID)
     * @param {string} input - URL、帶前綴 ID 或純數字 ID
     * @returns {{ type: string, id: string }|null}
     */
    static extractPixivInfo(input) {
        input = input.trim();

        // 從 URL 提取 users/ID
        const userUrlMatch = input.match(/pixiv\.net\/users?\/(\d+)/i);
        if (userUrlMatch) return { type: 'user', id: userUrlMatch[1] };

        // 從 URL 提取 artworks/ID
        const artworkUrlMatch = input.match(/pixiv\.net\/artworks?\/(\d+)/i);
        if (artworkUrlMatch) return { type: 'artwork', id: artworkUrlMatch[1] };

        // 支援 user:ID 或 artwork:ID 格式
        const prefixMatch = input.match(/^(user|artwork):(\d+)$/i);
        if (prefixMatch) return { type: prefixMatch[1].toLowerCase(), id: prefixMatch[2] };

        // 純數字：預設為用戶 ID
        if (/^\d+$/.test(input)) return { type: 'user', id: input };

        return null;
    }
}

module.exports = BlacklistManager;
