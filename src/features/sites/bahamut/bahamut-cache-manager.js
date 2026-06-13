/**
 * 巴哈姆特快取管理器（仿 ptt-cache-manager）
 * 多圖翻頁：把文章資料 + 圖片列表存成 temp/bahamut/{articleHash}.json，
 * 翻頁時直接讀快取，不需重新爬取。
 *
 * articleHash 取自 URL 的 bsn_snA（例：60076_9137032），取不到則用 md5。
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class BahamutCacheManager {
    constructor() {
        // __dirname = src/features/sites/bahamut → 專案根目錄 temp/bahamut
        this.cacheDir = path.join(__dirname, '..', '..', '..', '..', 'temp', 'bahamut');
        this.imagesPerPage = 4;
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 小時
        this._ensureCacheDir();
    }

    async _ensureCacheDir() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.error('[BahamutCache] 建立快取目錄失敗:', error.message);
        }
    }

    extractArticleHash(url) {
        const m = String(url).match(/bsn=(\d+).*?snA=(\d+)/);
        if (m) return `${m[1]}_${m[2]}`;
        return crypto.createHash('md5').update(String(url)).digest('hex').substring(0, 16);
    }

    getArticleCacheFile(articleHash) {
        return path.join(this.cacheDir, `${articleHash}.json`);
    }

    isCacheExpired(ts) {
        return (Date.now() - ts) > this.cacheExpiry;
    }

    async loadArticleCache(articleHash) {
        try {
            const file = this.getArticleCacheFile(articleHash);
            const cacheData = JSON.parse(await fs.readFile(file, 'utf8'));
            if (this.isCacheExpired(cacheData.timestamp)) {
                await fs.unlink(file).catch(() => {});
                return null;
            }
            return cacheData;
        } catch {
            return null;
        }
    }

    /**
     * 儲存文章資料 + 圖片列表
     * @param {string} url
     * @param {Object} data parseArticleData 結果（含 images）
     */
    async saveToCache(url, data) {
        try {
            const articleHash = this.extractArticleHash(url);
            const cacheData = {
                timestamp: Date.now(),
                cachedAt: new Date().toISOString(),
                url,
                articleHash,
                data
            };
            await fs.writeFile(this.getArticleCacheFile(articleHash), JSON.stringify(cacheData, null, 2), 'utf8');
        } catch (error) {
            console.error('[BahamutCache] 儲存快取失敗:', error.message);
        }
    }

    async cleanExpiredCache() {
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const filePath = path.join(this.cacheDir, file);
                try {
                    const cacheData = JSON.parse(await fs.readFile(filePath, 'utf8'));
                    if (this.isCacheExpired(cacheData.timestamp)) await fs.unlink(filePath);
                } catch {
                    await fs.unlink(filePath).catch(() => {});
                }
            }
        } catch (error) {
            console.error('[BahamutCache] 清理快取失敗:', error.message);
        }
    }
}

module.exports = BahamutCacheManager;
