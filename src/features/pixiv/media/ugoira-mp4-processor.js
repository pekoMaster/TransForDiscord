/**
 * Pixiv Ugoira MP4 處理器
 * 專門處理 Pixiv Ugoira 動畫轉換為 MP4 格式並上傳到 Discord
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const tfd = require('../../../shared/logging/tfd-logger');

class PixivUgoiraMp4Processor {
    constructor() {
        this.tempDir = path.join(__dirname, '..', '..', '..', '..', 'Pixiv_temp');
        this.maxDiscordFileSize = 25 * 1024 * 1024; // 25MB Discord 限制
    }

    /**
     * 處理 Pixiv Ugoira 動圖（完整的 embed + 檔案上傳）
     * @param {Object} artworkData - 從 Pixiv API 獲取的作品資料
     * @param {string} originalURL - 原始 Pixiv URL
     * @param {Object} channel - Discord 頻道物件
     * @returns {Promise<Object>} 處理結果
     */
    async processUgoiraToMp4(artworkData, originalURL, channel) {
        tfd.sys('Pixiv-Ugoira-MP4', `開始處理動圖: ${artworkData.id}`);

        try {
            // 1. 下載 MP4 檔案
            const downloadResult = await this.downloadMP4(artworkData.id);
            if (!downloadResult.success) {
                tfd.sys('Pixiv-Ugoira-MP4', `下載失敗: ${downloadResult.error}`);
                return { success: false, error: downloadResult.error };
            }

            // 2. 建構豐富的嵌入式訊息
            const embed = this.createRichEmbed(artworkData, originalURL);

            // 3. 準備檔案附件（支援防爆雷）
            const uploadFilename = artworkData.isR18 ?
                `SPOILER_${downloadResult.filename}` : downloadResult.filename;

            const attachment = new AttachmentBuilder(downloadResult.filepath, {
                name: uploadFilename,
                spoiler: artworkData.isR18
            });

            // 4. 檢查檔案大小
            const fileSizeMB = (downloadResult.fileSize / 1024 / 1024).toFixed(2);

            if (downloadResult.fileSize > this.maxDiscordFileSize) {
                // 檔案過大，只發送 embed
                embed.addFields({
                    name: '❌ 檔案大小',
                    value: `檔案過大 (${fileSizeMB} MB > 25 MB)\n已儲存至本地`,
                    inline: false
                });

                await channel.send({ embeds: [embed] });

                return {
                    success: false,
                    reason: 'file_too_large',
                    fileSizeMB: fileSizeMB
                };
            }

            // 5. 分別發送：先 embed，後檔案
            tfd.sys('Pixiv-Ugoira-MP4', '發送嵌入式訊息...');
            await channel.send({ embeds: [embed] });

            tfd.sys('Pixiv-Ugoira-MP4', '發送影片檔案...');
            await channel.send({ files: [attachment] });

            // 6. 清理本地檔案
            try {
                fs.unlinkSync(downloadResult.filepath);
                tfd.sys('Pixiv-Ugoira-MP4', '已自動清理本地檔案');
            } catch (deleteError) {
                tfd.sys('Pixiv-Ugoira-MP4', `清理檔案警告: ${deleteError.message}`);
            }

            tfd.sys('Pixiv-Ugoira-MP4', `處理完成: ${artworkData.id}`);
            return {
                success: true,
                uploaded: true,
                fileSize: downloadResult.fileSize,
                fileSizeMB: fileSizeMB,
                isR18: artworkData.isR18,
                autoDeleted: true
            };

        } catch (error) {
            tfd.sysError('Pixiv-Ugoira-MP4', `處理過程發生錯誤: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 下載 MP4 檔案
     * @param {string} pixivId - Pixiv 作品 ID
     * @returns {Promise<Object>} 下載結果
     */
    async downloadMP4(pixivId) {
        const mp4Url = `https://t-hk.ugoira.com/ugoira/${pixivId}.mp4`;
        const filename = `pixiv_${pixivId}_ugoira.mp4`;
        const filepath = path.join(this.tempDir, filename);

        // 檢查檔案是否已存在
        if (fs.existsSync(filepath)) {
            tfd.sys('Pixiv-Ugoira-MP4', `檔案已存在，跳過下載: ${filename}`);
            const stats = fs.statSync(filepath);
            return {
                success: true,
                filepath: filepath,
                filename: filename,
                fileSize: stats.size,
                cached: true
            };
        }

        // 確保目錄存在
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        return new Promise((resolve) => {
            const request = https.get(mp4Url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://ugoira.com/'
                }
            }, (response) => {
                if (response.statusCode !== 200) {
                    resolve({
                        success: false,
                        error: `HTTP ${response.statusCode}`
                    });
                    return;
                }

                const fileSize = parseInt(response.headers['content-length'] || '0');
                const writeStream = fs.createWriteStream(filepath);
                let downloadedBytes = 0;

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    writeStream.write(chunk);
                });

                response.on('end', () => {
                    writeStream.end();
                    tfd.sys('Pixiv-Ugoira-MP4', `下載完成: ${filename} (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);

                    resolve({
                        success: true,
                        filepath: filepath,
                        filename: filename,
                        fileSize: downloadedBytes,
                        cached: false
                    });
                });

                response.on('error', (error) => {
                    writeStream.destroy();
                    if (fs.existsSync(filepath)) {
                        fs.unlinkSync(filepath);
                    }
                    resolve({
                        success: false,
                        error: error.message
                    });
                });
            });

            request.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });

            request.setTimeout(60000, () => {
                request.destroy();
                resolve({
                    success: false,
                    error: 'Download timeout'
                });
            });
        });
    }

    /**
     * 建構豐富的嵌入式訊息
     * @param {Object} artworkData - 作品資料
     * @param {string} originalURL - 原始 URL
     * @returns {EmbedBuilder} Discord Embed
     */
    createRichEmbed(artworkData, originalURL) {
        const embed = new EmbedBuilder();

        // 設定顏色（R18 紅色，動圖橙色）
        const embedColor = artworkData.isR18 ? '#FF6B6B' : '#FF9500';
        embed.setColor(embedColor);

        // 標題和網址
        embed.setTitle(artworkData.title);
        embed.setURL(originalURL);

        // 作者資訊
        embed.setAuthor({
            name: artworkData.artist.name,
            url: `https://www.pixiv.net/users/${artworkData.artist.id}`,
            iconURL: artworkData.artist.profileImageUrl || null
        });

        // 描述
        if (artworkData.description && artworkData.description.trim()) {
            const cleanDescription = artworkData.description
                .replace(/<[^>]*>/g, '') // 移除 HTML 標籤
                .replace(/\n/g, '\n')    // 保留換行
                .substring(0, 300);       // 限制長度

            if (cleanDescription.length > 0) {
                embed.setDescription(cleanDescription);
            }
        }

        // 統計資訊欄位
        const stats = [];
        if (artworkData.viewCount > 0) stats.push(`👀 ${artworkData.viewCount.toLocaleString()} 瀏覽`);
        if (artworkData.likeCount > 0) stats.push(`❤️ ${artworkData.likeCount.toLocaleString()} 讚`);
        if (artworkData.bookmarkCount > 0) stats.push(`🔖 ${artworkData.bookmarkCount.toLocaleString()} 收藏`);

        if (stats.length > 0) {
            embed.addFields({
                name: '📊 統計資訊',
                value: stats.join(' • '),
                inline: false
            });
        }

        // 標籤欄位
        if (artworkData.tags && artworkData.tags.length > 0) {
            const tagStrings = artworkData.tags.slice(0, 10).map(tagObj => {
                const tag = typeof tagObj === 'object' ? tagObj.tag : tagObj;
                const isR18 = typeof tagObj === 'object' ? tagObj.isR18 :
                              (tag && (tag.includes('R-18') || tag.includes('R18')));
                return isR18 ? `${tag} 🔞` : tag;
            });

            embed.addFields({
                name: '🏷️ 標籤',
                value: tagStrings.join(' • '),
                inline: false
            });

            if (artworkData.tags.length > 10) {
                embed.addFields({
                    name: '　', // 空白字符避免名稱重複
                    value: `... 還有 ${artworkData.tags.length - 10} 個標籤`,
                    inline: false
                });
            }
        }

        // 設定縮圖
        if (artworkData.thumbnailUrl) {
            embed.setThumbnail(artworkData.thumbnailUrl);
        }

        // 設定時間戳
        if (artworkData.createDate) {
            embed.setTimestamp(new Date(artworkData.createDate));
        } else {
            embed.setTimestamp();
        }

        // 設定底部
        embed.setFooter({
            text: `Pixiv ID: ${artworkData.id} • Ugoira 動圖 (已轉換為 MP4)`,
            iconURL: 'https://www.pixiv.net/favicon.ico'
        });

        return embed;
    }

    /**
     * 提取標籤資訊（統一格式）
     * @param {Object} tagsData - Pixiv API 標籤資料
     * @returns {Array} 統一的標籤陣列
     */
    extractTags(tagsData) {
        if (!tagsData || !tagsData.tags) return [];

        return tagsData.tags.map(tag => ({
            tag: `#${tag.tag}`,
            translation: tag.translation?.en || tag.tag,
            isR18: tag.tag.toLowerCase().includes('r-18') ||
                   tag.tag.toLowerCase().includes('r18') ||
                   tag.tag === 'R-18'
        }));
    }
}

module.exports = PixivUgoiraMp4Processor;
