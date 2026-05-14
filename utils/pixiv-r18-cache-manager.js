/**
 * Pixiv R18 圖片快取管理器
 * 用於儲存 R18 圖片 URL，支援分頁翻頁功能
 *
 * 新架構：
 * 1. 將圖片上傳到隱密 Discord 頻道
 * 2. 獲取 Discord attachment URL
 * 3. 使用 Discord URL 在 embed 中顯示（可編輯）
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { AttachmentBuilder } = require('discord.js');
const tfd = require('./tfd-logger');

// 隱密頻道設定（從環境變數讀取，未設定則停用上傳功能）
const R18_CACHE_GUILD_ID = process.env.PIXIV_R18_GUILD_ID || '';
const R18_CACHE_CHANNEL_ID = process.env.PIXIV_R18_CHANNEL_ID || '';

class PixivR18CacheManager {
    constructor(client = null) {
        this.client = client;
        this.cacheDir = path.join(__dirname, '..', 'data', 'pixiv_r18_cache');
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 小時過期

        // 確保快取目錄存在
        this.ensureCacheDir();
    }

    /**
     * 設定 Discord client（延遲注入）
     * @param {Client} client - Discord client
     */
    setClient(client) {
        this.client = client;
    }

    /**
     * 確保快取目錄存在
     */
    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * 取得快取檔案路徑
     * @param {string} artworkId - 作品 ID
     * @returns {string}
     */
    getCacheFilePath(artworkId) {
        return path.join(this.cacheDir, `r18_${artworkId}.json`);
    }

    /**
     * 下載圖片並轉換為 Buffer
     * @param {string} imageUrl - 圖片 URL
     * @param {number} index - 圖片索引
     * @returns {Promise<Object|null>}
     */
    async downloadImage(imageUrl, index = 0) {
        try {
            tfd.sys('Pixiv R18 Cache', `下載圖片 ${index + 1}: ${imageUrl.substring(0, 80)}...`);

            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.pixiv.net/'
                }
            });

            tfd.sys('Pixiv R18 Cache', `下載完成，大小: ${response.data.byteLength} bytes`);

            // 判斷檔案類型
            let extension = 'jpg';
            const contentType = response.headers['content-type'];
            if (contentType) {
                if (contentType.includes('png')) extension = 'png';
                else if (contentType.includes('gif')) extension = 'gif';
                else if (contentType.includes('webp')) extension = 'webp';
            }

            return {
                buffer: Buffer.from(response.data),
                extension: extension,
                fileName: `pixiv_r18_${index}.${extension}`
            };

        } catch (error) {
            tfd.sysError('Pixiv-R18-Cache', `下載圖片失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * 上傳圖片到隱密頻道並獲取 Discord URL
     * @param {string} artworkId - 作品 ID
     * @param {Array<string>} imageUrls - 原始圖片 URL 陣列
     * @param {Object} metadata - 作品元資料
     * @returns {Promise<Array<string>|null>} Discord attachment URL 陣列
     */
    async uploadImagesToDiscord(artworkId, imageUrls, metadata = {}) {
        if (!this.client) {
            tfd.sysError('Pixiv R18 Cache', `Discord client 未設定`);
            return null;
        }

        if (!R18_CACHE_CHANNEL_ID) {
            tfd.sysWarn('Pixiv R18 Cache', `PIXIV_R18_CHANNEL_ID 未設定，跳過上傳，使用 SPOILER 模式`);
            return null;
        }

        tfd.sys('Pixiv R18 Cache', `準備上傳，client 已設定，嘗試獲取頻道 ${R18_CACHE_CHANNEL_ID}...`);

        try {
            // 獲取隱密頻道
            let channel;
            try {
                channel = await this.client.channels.fetch(R18_CACHE_CHANNEL_ID);
            } catch (fetchError) {
                tfd.sysError('Pixiv R18 Cache', `獲取頻道失敗: ${fetchError.message}`);
                tfd.sysError('Pixiv R18 Cache', `錯誤代碼: ${fetchError.code}`);
                return null;
            }

            if (!channel) {
                tfd.sysError('Pixiv R18 Cache', `無法找到隱密頻道: ${R18_CACHE_CHANNEL_ID}`);
                return null;
            }

            tfd.sys('Pixiv R18 Cache', `成功獲取頻道: ${channel.name || channel.id}`);
            tfd.sys('Pixiv R18 Cache', `開始上傳 ${imageUrls.length} 張圖片到隱密頻道...`);

            const discordUrls = [];

            // 逐張上傳圖片
            for (let i = 0; i < imageUrls.length; i++) {
                const imageData = await this.downloadImage(imageUrls[i], i);
                if (!imageData) {
                    tfd.sysWarn('Pixiv R18 Cache', `跳過第 ${i + 1} 張圖片（下載失敗）`);
                    continue;
                }

                // 創建附件
                const attachment = new AttachmentBuilder(imageData.buffer, {
                    name: `r18_${artworkId}_${i}.${imageData.extension}`
                });

                // 上傳到隱密頻道
                const msg = await channel.send({
                    content: `R18 Cache | ${artworkId} | ${i + 1}/${imageUrls.length} | ${metadata.title || '無標題'}`,
                    files: [attachment]
                });

                // 獲取 Discord attachment URL
                const discordUrl = msg.attachments.first()?.url;
                if (discordUrl) {
                    discordUrls.push(discordUrl);
                    tfd.sys('Pixiv R18 Cache', `已上傳第 ${i + 1}/${imageUrls.length} 張`);
                }
            }

            if (discordUrls.length === 0) {
                tfd.sysError('Pixiv R18 Cache', `所有圖片上傳失敗`);
                return null;
            }

            tfd.sys('Pixiv R18 Cache', `成功上傳 ${discordUrls.length}/${imageUrls.length} 張圖片`);
            return discordUrls;

        } catch (error) {
            tfd.sysError('Pixiv-R18-Cache', `上傳圖片到 Discord 失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * 儲存 R18 圖片快取（包含 Discord URL 和訊息 ID）
     * @param {string} artworkId - 作品 ID
     * @param {Array<string>} originalUrls - 原始圖片 URL 陣列
     * @param {Array<string>} discordUrls - Discord attachment URL 陣列
     * @param {Object} metadata - 作品元資料
     * @param {Object} messageIds - 訊息 ID（embedMessageId, imageMessageId）
     */
    async saveR18ImageCache(artworkId, originalUrls, discordUrls = null, metadata = {}, messageIds = {}) {
        try {
            const cacheData = {
                artworkId: artworkId,
                images: originalUrls,
                discordImages: discordUrls || [], // Discord URL（用於 embed 顯示）
                totalImages: originalUrls.length,
                metadata: {
                    title: metadata.title || '無標題',
                    description: metadata.description || '',
                    author: metadata.author || '未知作者',
                    authorId: metadata.authorId,
                    authorAvatar: metadata.authorAvatar || null,
                    originalURL: metadata.originalURL,
                    dimensions: metadata.dimensions || null,
                    viewCount: metadata.viewCount || 0,
                    bookmarkCount: metadata.bookmarkCount || 0,
                    likeCount: metadata.likeCount || 0,
                    createDate: metadata.createDate || null,
                    tags: metadata.tags || []
                },
                // 訊息 ID（用於翻頁時直接編輯）
                channelId: messageIds.channelId || null,
                embedMessageId: messageIds.embedMessageId || null,
                imageMessageId: messageIds.imageMessageId || null,
                createdAt: Date.now(),
                expiresAt: Date.now() + this.cacheExpiry
            };

            const filePath = this.getCacheFilePath(artworkId);
            fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2), 'utf-8');

            tfd.sys('Pixiv R18 Cache', `已儲存作品 ${artworkId} 的快取 (${originalUrls.length} 張圖片, Discord URL: ${discordUrls ? discordUrls.length : 0}, 訊息ID: ${messageIds.imageMessageId || 'none'})`);
            return true;

        } catch (error) {
            tfd.sysError('Pixiv-R18-Cache', `儲存快取失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 讀取 R18 圖片快取
     * @param {string} artworkId - 作品 ID
     * @returns {Object|null}
     */
    async loadR18ImageCache(artworkId) {
        try {
            const filePath = this.getCacheFilePath(artworkId);

            if (!fs.existsSync(filePath)) {
                tfd.sys('Pixiv R18 Cache', `快取不存在: ${artworkId}`);
                return null;
            }

            const cacheData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

            // 檢查是否過期
            if (Date.now() > cacheData.expiresAt) {
                tfd.sys('Pixiv R18 Cache', `快取已過期: ${artworkId}`);
                this.deleteCache(artworkId);
                return null;
            }

            tfd.sys('Pixiv R18 Cache', `成功讀取快取: ${artworkId}`);
            return cacheData;

        } catch (error) {
            tfd.sysError('Pixiv-R18-Cache', `讀取快取失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * 取得指定頁面的圖片 URL
     * @param {string} artworkId - 作品 ID
     * @param {number} pageIndex - 頁面索引 (從 0 開始)
     * @returns {Object|null}
     */
    async getPageImage(artworkId, pageIndex) {
        const cacheData = await this.loadR18ImageCache(artworkId);

        if (!cacheData) {
            return null;
        }

        if (pageIndex < 0 || pageIndex >= cacheData.totalImages) {
            tfd.sys('Pixiv R18 Cache', `頁面索引超出範圍: ${pageIndex}/${cacheData.totalImages}`);
            return null;
        }

        // 優先使用 Discord URL（可用於 embed 編輯）
        const hasDiscordUrls = cacheData.discordImages && cacheData.discordImages.length > pageIndex;
        const imageUrl = hasDiscordUrls
            ? cacheData.discordImages[pageIndex]
            : cacheData.images[pageIndex];

        return {
            imageUrl: imageUrl,
            discordUrl: hasDiscordUrls ? cacheData.discordImages[pageIndex] : null,
            originalUrl: cacheData.images[pageIndex],
            currentPage: pageIndex,
            totalImages: cacheData.totalImages,
            hasDiscordUrls: hasDiscordUrls,
            metadata: cacheData.metadata,
            // 訊息 ID（用於翻頁時直接編輯）
            channelId: cacheData.channelId || null,
            imageMessageId: cacheData.imageMessageId || null
        };
    }

    /**
     * 刪除快取
     * @param {string} artworkId - 作品 ID
     */
    deleteCache(artworkId) {
        try {
            const filePath = this.getCacheFilePath(artworkId);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                tfd.sys('Pixiv R18 Cache', `已刪除快取: ${artworkId}`);
            }
        } catch (error) {
            tfd.sysError('Pixiv-R18-Cache', `刪除快取失敗: ${error.message}`);
        }
    }

    /**
     * 清理過期快取
     */
    cleanupExpiredCache() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                return;
            }

            const files = fs.readdirSync(this.cacheDir);
            let cleanedCount = 0;

            for (const file of files) {
                if (!file.startsWith('r18_') || !file.endsWith('.json')) {
                    continue;
                }

                const filePath = path.join(this.cacheDir, file);

                try {
                    const cacheData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

                    if (Date.now() > cacheData.expiresAt) {
                        fs.unlinkSync(filePath);
                        cleanedCount++;
                    }
                } catch (e) {
                    // 無法解析的快取檔案，直接刪除
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                tfd.sys('Pixiv R18 Cache', `已清理 ${cleanedCount} 個過期快取`);
            }

        } catch (error) {
            tfd.sysError('Pixiv-R18-Cache', `清理過期快取失敗: ${error.message}`);
        }
    }
}

module.exports = PixivR18CacheManager;
