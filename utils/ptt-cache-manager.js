/**
 * PTT 快取管理器
 * 參考 PIXIV 多分頁 JSON 技術實作
 * 用於提升翻頁效能和避免重複爬取
 *
 * 架構：
 * - 每個文章獨立檔案：temp/ptt/{articleHash}.json
 * - 檔案結構包含完整文章資訊和圖片列表
 * - 分頁時直接從快取讀取，無需重新爬取
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const tfd = require('./tfd-logger');

class PTTCacheManager {
    constructor() {
        this.cacheDir = path.join(__dirname, '..', 'temp', 'ptt');
        this.imagesPerPage = 4;      // 每頁4張圖片（與 Pixiv 相同）
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24小時快取過期時間
        this.ensureCacheDir();
    }

    /**
     * 確保快取目錄存在
     */
    async ensureCacheDir() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            tfd.sys('PTTCache', `快取目錄已準備: ${this.cacheDir}`);
        } catch (error) {
            tfd.sysError('PTTCache', `建立快取目錄失敗: ${error.message}`);
        }
    }

    /**
     * 從 URL 提取文章 Hash
     * @param {string} url - PTT 文章網址
     * @returns {string}
     */
    extractArticleHash(url) {
        // URL 格式：https://www.ptt.cc/bbs/C_Chat/M.1759372308.A.003.html
        // 提取 M.{timestamp}.A.{hash} 作為唯一識別
        const match = url.match(/M\.(\d+)\.A\.([A-F0-9]+)\.html/i);
        if (match) {
            return `${match[1]}-${match[2]}`; // 例如：1759372308-003（用連字號避免與 customId 的底線分隔符衝突）
        }
        // 如果無法提取，使用 URL 雜湊作為備案
        return crypto.createHash('md5').update(url).digest('hex').substring(0, 16);
    }

    /**
     * 獲取文章快取檔案路徑
     * @param {string} articleHash - 文章 Hash
     * @returns {string}
     */
    getArticleCacheFile(articleHash) {
        return path.join(this.cacheDir, `${articleHash}.json`);
    }

    /**
     * 檢查快取是否過期
     * @param {number} cacheTimestamp - 快取時間戳記
     * @returns {boolean}
     */
    isCacheExpired(cacheTimestamp) {
        return (Date.now() - cacheTimestamp) > this.cacheExpiry;
    }

    /**
     * 讀取文章快取資料
     * @param {string} articleHash - 文章 Hash
     * @returns {Object|null}
     */
    async loadArticleCache(articleHash) {
        try {
            const cacheFile = this.getArticleCacheFile(articleHash);
            const data = await fs.readFile(cacheFile, 'utf8');
            const cacheData = JSON.parse(data);

            // 檢查快取是否過期
            if (this.isCacheExpired(cacheData.timestamp)) {
                tfd.sys('PTTCache', `快取已過期: ${articleHash}`);
                await fs.unlink(cacheFile); // 刪除過期快取
                return null;
            }

            tfd.sys('PTTCache', `快取命中: ${articleHash}.json`);
            return cacheData;
        } catch (error) {
            // 檔案不存在或格式錯誤，返回null
            return null;
        }
    }

    /**
     * 儲存文章快取資料
     * @param {string} articleHash - 文章 Hash
     * @param {Object} cacheData - 快取資料
     */
    async saveArticleCache(articleHash, cacheData) {
        try {
            const cacheFile = this.getArticleCacheFile(articleHash);
            await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
            tfd.sys('PTTCache', `快取已儲存: ${articleHash}.json`);
        } catch (error) {
            tfd.sysError('PTTCache', `儲存快取失敗: ${error.message}`);
        }
    }

    /**
     * 將圖片陣列分頁
     * @param {Array} allImages - 所有圖片URL
     * @returns {Array} - 分頁後的圖片陣列
     */
    createPages(allImages) {
        const pages = [];
        for (let i = 0; i < allImages.length; i += this.imagesPerPage) {
            const pageImages = allImages.slice(i, i + this.imagesPerPage);
            pages.push({
                pageIndex: Math.floor(i / this.imagesPerPage),
                images: pageImages,
                imageCount: pageImages.length
            });
        }
        return pages;
    }

    /**
     * 檢查快取中是否有指定 URL 的資料
     * @param {string} url - PTT 文章網址
     * @returns {Object|null}
     */
    async getCachedData(url) {
        try {
            const articleHash = this.extractArticleHash(url);
            if (!articleHash) {
                tfd.sys('PTTCache', `無法從URL提取文章Hash: ${url}`);
                return null;
            }

            const cached = await this.loadArticleCache(articleHash);

            if (cached) {
                tfd.sys('PTTCache', `快取命中: ${articleHash}.json`);
                return cached;
            }

            tfd.sys('PTTCache', `快取未命中: ${articleHash}.json`);
            return null;
        } catch (error) {
            tfd.sysError('PTTCache', `讀取快取失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * 儲存 PTT 資料到快取
     * @param {string} url - PTT 文章網址
     * @param {Object} articleData - 文章資料
     * @param {Array} allImages - 所有有效圖片URL
     */
    async saveToCache(url, articleData, allImages) {
        try {
            const articleHash = this.extractArticleHash(url);
            if (!articleHash) {
                tfd.sys('PTTCache', `無法從URL提取文章Hash: ${url}`);
                return;
            }

            // 建立分頁資料
            const pages = this.createPages(allImages);

            // 儲存必要資料
            const cacheData = {
                timestamp: Date.now(),
                cachedAt: new Date().toISOString(),
                url: url,
                articleHash: articleHash,
                articleData: {
                    title: articleData.title,
                    author: articleData.author,
                    board: articleData.board,
                    publishTime: articleData.publishTime,
                    content: articleData.content,
                    pushStats: articleData.pushStats
                },
                pages: pages,
                totalImages: allImages.length,
                totalPages: pages.length
            };

            await this.saveArticleCache(articleHash, cacheData);
            tfd.sys('PTTCache', `快取建立成功: ${articleHash}.json (${allImages.length} 張圖片, ${pages.length} 頁)`);
        } catch (error) {
            tfd.sysError('PTTCache', `儲存快取失敗: ${error.message}`);
        }
    }

    /**
     * 獲取指定頁面的圖片資料
     * @param {string} url - PTT 文章網址
     * @param {number} pageIndex - 頁面索引
     * @returns {Object|null}
     */
    async getPageData(url, pageIndex) {
        try {
            const cachedData = await this.getCachedData(url);
            if (!cachedData) {
                return null;
            }

            if (pageIndex < 0 || pageIndex >= cachedData.pages.length) {
                tfd.sys('PTTCache', `頁面索引超出範圍: ${pageIndex}`);
                return null;
            }

            return {
                ...cachedData,
                currentPage: cachedData.pages[pageIndex]
            };
        } catch (error) {
            tfd.sysError('PTTCache', `獲取頁面資料失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * 清理過期快取（由排程器調用）
     */
    async cleanExpiredCache() {
        try {
            const files = await fs.readdir(this.cacheDir);
            let cleanedCount = 0;

            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                const filePath = path.join(this.cacheDir, file);
                try {
                    const data = await fs.readFile(filePath, 'utf8');
                    const cacheData = JSON.parse(data);

                    if (this.isCacheExpired(cacheData.timestamp)) {
                        await fs.unlink(filePath);
                        cleanedCount++;
                    }
                } catch (error) {
                    // 無效的 JSON 檔案，直接刪除
                    await fs.unlink(filePath);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                tfd.sys('PTTCache', `清理完成: 刪除 ${cleanedCount} 個過期快取檔案`);
            }
        } catch (error) {
            tfd.sysError('PTTCache', `清理快取失敗: ${error.message}`);
        }
    }
}

module.exports = PTTCacheManager;
