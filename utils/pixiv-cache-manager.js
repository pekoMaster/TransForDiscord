/**
 * PIXIV 快取管理器 (重新設計版)
 * 用於提升翻頁效能和減少 API 呼叫
 *
 * 新架構：
 * - 每個作品獨立檔案：temp/pixiv/{artworkId}.json
 * - 檔案結構簡化，只存必要資料
 * - 每日自動清理整個資料夾
 */

const fs = require('fs').promises;
const path = require('path');

class PixivCacheManager {
    constructor() {
        this.cacheDir = path.join(__dirname, '..', 'temp', 'pixiv');
        this.imagesPerPage = 4; // 每頁最多4張圖片
        this.ensureCacheDir();
    }

    /**
     * 確保快取目錄存在
     */
    async ensureCacheDir() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.error('[PixivCache] 建立快取目錄失敗:', error.message);
        }
    }

    /**
     * 從網址提取作品ID
     * @param {string} url - PIXIV 網址
     * @returns {string}
     */
    extractArtworkId(url) {
        const match = url.match(/artworks\/(\d+)/);
        return match ? match[1] : '';
    }

    /**
     * 獲取作品快取檔案路徑
     * @param {string} artworkId - 作品ID
     * @returns {string}
     */
    getArtworkCacheFile(artworkId) {
        return path.join(this.cacheDir, `${artworkId}.json`);
    }

    /**
     * 讀取作品快取資料
     * @param {string} artworkId - 作品ID
     * @returns {Object|null}
     */
    async loadArtworkCache(artworkId) {
        try {
            const cacheFile = this.getArtworkCacheFile(artworkId);
            const data = await fs.readFile(cacheFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // 檔案不存在或格式錯誤，返回null
            return null;
        }
    }

    /**
     * 儲存作品快取資料
     * @param {string} artworkId - 作品ID
     * @param {Object} cacheData - 快取資料
     */
    async saveArtworkCache(artworkId, cacheData) {
        try {
            const cacheFile = this.getArtworkCacheFile(artworkId);
            await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
        } catch (error) {
            console.error('[PixivCache] 儲存快取失敗:', error.message);
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
     * @param {string} url - PIXIV 網址
     * @returns {Object|null}
     */
    async getCachedData(url) {
        try {
            const artworkId = this.extractArtworkId(url);
            if (!artworkId) {
                console.log(`[PixivCache] 無法從URL提取作品ID: ${url}`);
                return null;
            }

            const cached = await this.loadArtworkCache(artworkId);

            if (cached) {
                console.log(`[PixivCache] 快取命中: ${artworkId}.json`);
                return cached;
            }

            console.log(`[PixivCache] 快取未命中: ${artworkId}.json`);
            return null;
        } catch (error) {
            console.error('[PixivCache] 讀取快取失敗:', error.message);
            return null;
        }
    }

    /**
     * 儲存 PIXIV 資料到快取
     * @param {string} url - PIXIV 網址
     * @param {Object} artworkData - 作品資料
     * @param {Array} allImages - 所有圖片URL
     */
    async saveToCache(url, artworkData, allImages) {
        try {
            const artworkId = this.extractArtworkId(url);
            if (!artworkId) {
                console.log(`[PixivCache] 無法從URL提取作品ID: ${url}`);
                return;
            }

            // 建立分頁資料
            const pages = this.createPages(allImages);

            // 只儲存必要資料，單一作品檔案結構
            const cacheData = {
                cachedAt: new Date().toISOString(),
                url: url,
                // 保留完整資料用於翻頁顯示
                artworkData: {
                    id: artworkData.id,
                    title: artworkData.title,
                    description: artworkData.description || '',
                    artist: artworkData.artist ? {
                        name: artworkData.artist.name,
                        id: artworkData.artist.id,
                        avatar: artworkData.artist.avatar || null
                    } : null,
                    isR18: artworkData.isR18 || false,
                    type: artworkData.type,
                    // 完整 metadata
                    width: artworkData.width || null,
                    height: artworkData.height || null,
                    dimensions: artworkData.width && artworkData.height
                        ? `${artworkData.width}×${artworkData.height}`
                        : (artworkData.dimensions || null),
                    viewCount: artworkData.viewCount || 0,
                    bookmarkCount: artworkData.bookmarkCount || 0,
                    likeCount: artworkData.likeCount || 0,
                    commentCount: artworkData.commentCount || 0,
                    createDate: artworkData.createDate || null,
                    tags: artworkData.tags || []
                },
                allImages: allImages,
                pages: pages,
                totalPages: pages.length,
                totalImages: allImages.length,
                isR18: artworkData.isR18 || false
            };

            await this.saveArtworkCache(artworkId, cacheData);
            console.log(`[PixivCache] 已快取: ${artworkId}.json (${allImages.length}張圖片, ${pages.length}頁)`);

        } catch (error) {
            console.error('[PixivCache] 儲存快取失敗:', error.message);
        }
    }

    /**
     * 從快取獲取特定頁面資料
     * @param {string} url - PIXIV 網址
     * @param {number} pageIndex - 頁面索引 (0開始)
     * @returns {Object|null}
     */
    async getPageData(url, pageIndex) {
        try {
            const artworkId = this.extractArtworkId(url);
            if (!artworkId) {
                console.log(`[PixivCache] 無法從URL提取作品ID: ${url}`);
                return null;
            }

            const cachedData = await this.loadArtworkCache(artworkId);

            if (!cachedData) {
                console.log(`[PixivCache] 頁面資料不存在: ${artworkId}.json 第${pageIndex + 1}頁`);
                return null;
            }

            const targetPage = cachedData.pages[pageIndex];
            if (!targetPage) {
                console.log(`[PixivCache] 頁面索引超出範圍: ${artworkId}.json 第${pageIndex + 1}頁`);
                return null;
            }

            console.log(`[PixivCache] 頁面資料獲取成功: ${artworkId}.json 第${pageIndex + 1}頁 (${targetPage.imageCount}張圖)`);

            return {
                artworkData: cachedData.artworkData,
                currentPage: pageIndex,
                totalPages: cachedData.totalPages,
                totalImages: cachedData.totalImages,
                pageImages: targetPage.images,
                pageImageCount: targetPage.imageCount,
                isR18: cachedData.isR18
            };

        } catch (error) {
            console.error('[PixivCache] 獲取頁面資料失敗:', error.message);
            return null;
        }
    }

    /**
     * 清理所有快取檔案 (每日00:00執行)
     * 新架構：直接清理整個資料夾，不檢查日期
     */
    async cleanAllCache() {
        try {
            const files = await fs.readdir(this.cacheDir);
            let cleanedCount = 0;

            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                const filePath = path.join(this.cacheDir, file);
                await fs.unlink(filePath);
                cleanedCount++;
                console.log(`[PixivCache] 已清理快取: ${file}`);
            }

            if (cleanedCount > 0) {
                console.log(`[PixivCache] 每日清理完成，共清理 ${cleanedCount} 個快取檔案`);
            } else {
                console.log(`[PixivCache] 每日清理完成，沒有快取檔案需要清理`);
            }

        } catch (error) {
            console.error('[PixivCache] 清理快取失敗:', error.message);
        }
    }

    /**
     * 獲取快取統計資訊 (新架構)
     * @returns {Object}
     */
    async getCacheStats() {
        try {
            const files = await fs.readdir(this.cacheDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));

            let totalImages = 0;
            let r18Count = 0;
            let totalSize = 0;

            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(this.cacheDir, file);
                    const stats = await fs.stat(filePath);
                    totalSize += stats.size;

                    const artworkId = file.replace('.json', '');
                    const cachedData = await this.loadArtworkCache(artworkId);

                    if (cachedData) {
                        totalImages += cachedData.totalImages || 0;
                        if (cachedData.isR18) r18Count++;
                    }
                } catch (error) {
                    console.warn(`[PixivCache] 讀取統計檔案失敗: ${file}`);
                }
            }

            return {
                totalCachedArtworks: jsonFiles.length,
                totalImages: totalImages,
                r18Count: r18Count,
                normalCount: jsonFiles.length - r18Count,
                totalCacheSize: Math.round(totalSize / 1024), // KB
                cacheDir: this.cacheDir
            };

        } catch (error) {
            console.error('[PixivCache] 獲取統計失敗:', error.message);
            return null;
        }
    }
}

module.exports = PixivCacheManager;