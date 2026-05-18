/**
 * Pixiv 多圖片附件優化器
 * 將 Pixiv 多圖片作品的所有圖片作為附件一次性上傳
 * 避免多個 embed 造成洗頻效果
 */

const { AttachmentBuilder } = require('discord.js');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const tfd = require('../../../shared/logging/tfd-logger');

class PixivImageAttachmentOptimizer {
    constructor() {
        this.tempDir = path.join(__dirname, '../../../../temp');
        this.ensureTempDir();

        // Discord 附件限制
        this.maxSingleFileMB = 8;  // 單檔限制 8MB
        this.maxTotalMB = 20;      // 總大小限制 20MB (保守估計)
        this.maxImages = 10;       // 最多處理 10 張圖片
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * 檢查是否需要使用附件優化
     * @param {Array} imageUrls 圖片 URL 陣列
     * @returns {boolean}
     */
    shouldOptimize(imageUrls) {
        // 2張以上才需要優化
        return imageUrls && imageUrls.length >= 2 && imageUrls.length <= this.maxImages;
    }

    /**
     * 檢查圖片是否適合作為附件
     */
    async checkImageSuitability(imageUrl) {
        try {
            const response = await this.makeHeadRequest(imageUrl);
            const contentLength = response.headers['content-length'];

            if (contentLength) {
                const sizeMB = parseInt(contentLength) / 1024 / 1024;
                const isSmallEnough = sizeMB <= this.maxSingleFileMB;

                return {
                    suitable: isSmallEnough,
                    sizeMB: sizeMB,
                    sizeBytes: parseInt(contentLength),
                    contentType: response.headers['content-type']
                };
            }

            // 沒有 content-length，假設適合（之後下載時會驗證）
            return { suitable: true, sizeMB: 0, sizeBytes: 0, unknown: true };
        } catch (error) {
            // HEAD 請求失敗時，假設適合（之後下載時會驗證）
            // 這避免了因為代理服務不支援 HEAD 而導致的問題
            tfd.sysWarn('PixivImageOptimizer', `HEAD 請求失敗，將嘗試直接下載: ${error.message}`);
            return { suitable: true, sizeMB: 0, sizeBytes: 0, unknown: true };
        }
    }

    /**
     * 發送 HEAD 請求檢查檔案大小
     */
    makeHeadRequest(url) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const protocol = url.startsWith('https') ? https : http;

            const options = {
                method: 'HEAD',
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.pixiv.net/',
                    'Accept': 'image/*'
                }
            };

            const request = protocol.request(options, (response) => {
                // 處理重定向
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    this.makeHeadRequest(response.headers.location)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
                resolve(response);
            });

            request.on('error', reject);
            request.setTimeout(15000, () => {
                request.destroy();
                reject(new Error('請求超時'));
            });

            request.end();
        });
    }

    /**
     * 下載圖片作為附件
     */
    async downloadImageAsAttachment(imageUrl, artworkId, index) {
        tfd.sys('PixivImageOptimizer', `開始下載圖片 ${index + 1}: ${imageUrl.substring(0, 80)}...`);

        const extension = this.getImageExtension(imageUrl);
        const fileName = `pixiv_${artworkId}_${index + 1}.${extension}`;
        const filePath = path.join(this.tempDir, fileName);

        try {
            await this.downloadFile(imageUrl, filePath);

            const attachment = new AttachmentBuilder(filePath, {
                name: fileName,
                description: `Pixiv 作品圖片 ${index + 1}`
            });

            tfd.sys('PixivImageOptimizer', `✅ 圖片 ${index + 1} 下載完成: ${fileName}`);

            return {
                attachment,
                filePath,
                fileName
            };

        } catch (error) {
            tfd.sysError('PixivImageOptimizer', `下載圖片 ${index + 1} 失敗: ${error.message}`);
            this.cleanupFile(filePath);
            throw error;
        }
    }

    /**
     * 取得圖片副檔名
     */
    getImageExtension(url) {
        if (url.includes('.jpg') || url.includes('jpeg')) return 'jpg';
        if (url.includes('.png')) return 'png';
        if (url.includes('.gif')) return 'gif';
        if (url.includes('.webp')) return 'webp';
        return 'jpg'; // 預設
    }

    /**
     * 下載檔案
     */
    downloadFile(url, filePath) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const protocol = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(filePath);

            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.pixiv.net/',
                    'Accept': 'image/*'
                }
            };

            const request = protocol.get(options, (response) => {
                // 處理重定向
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    file.close();
                    fs.unlinkSync(filePath);
                    this.downloadFile(response.headers.location, filePath)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    file.close();
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });

                file.on('error', (err) => {
                    fs.unlink(filePath, () => {}); // 清理檔案
                    reject(err);
                });
            });

            request.on('error', (err) => {
                fs.unlink(filePath, () => {}); // 清理檔案
                reject(err);
            });

            request.setTimeout(30000, () => {
                request.destroy();
                fs.unlink(filePath, () => {}); // 清理檔案
                reject(new Error('下載超時'));
            });
        });
    }

    /**
     * 清理臨時檔案
     */
    cleanupFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                tfd.sys('PixivImageOptimizer', `🗑️ 臨時檔案已清理: ${path.basename(filePath)}`);
            }
        } catch (error) {
            tfd.sysError('PixivImageOptimizer', `清理檔案失敗: ${error.message}`);
        }
    }

    /**
     * 批量清理檔案
     */
    cleanupFiles(filePaths) {
        filePaths.forEach(filePath => {
            this.cleanupFile(filePath);
        });
    }

    /**
     * 處理多圖片附件優化（主要入口）
     * @param {Array} imageUrls 圖片 URL 陣列
     * @param {string} artworkId 作品 ID
     * @returns {Object|null} 附件結果或 null（表示回退到原本邏輯）
     */
    async processImageAttachments(imageUrls, artworkId) {
        // 檢查是否需要優化
        if (!this.shouldOptimize(imageUrls)) {
            return null;
        }

        tfd.sys('PixivImageOptimizer', `🎯 開始處理 ${imageUrls.length} 張圖片作為附件`);

        try {
            const attachments = [];
            const filePaths = [];
            let totalSize = 0;

            // 先檢查所有圖片的適合性
            for (let i = 0; i < imageUrls.length; i++) {
                const suitability = await this.checkImageSuitability(imageUrls[i]);

                if (!suitability.suitable) {
                    tfd.sys('PixivImageOptimizer', `圖片 ${i + 1} 太大或檢查失敗，跳過附件優化`);
                    return null;
                }

                totalSize += suitability.sizeMB;
            }

            // 檢查總大小
            if (totalSize > this.maxTotalMB) {
                tfd.sys('PixivImageOptimizer', `總大小太大 (${totalSize.toFixed(2)}MB)，跳過附件優化`);
                return null;
            }

            tfd.sys('PixivImageOptimizer', `預估總大小: ${totalSize.toFixed(2)}MB，開始下載...`);

            // 下載所有圖片作為附件
            for (let i = 0; i < imageUrls.length; i++) {
                const result = await this.downloadImageAsAttachment(imageUrls[i], artworkId, i);
                attachments.push(result.attachment);
                filePaths.push(result.filePath);
            }

            tfd.sys('PixivImageOptimizer', `✅ 成功下載 ${attachments.length} 張圖片作為附件`);

            return {
                success: true,
                attachments: attachments,
                cleanup: () => this.cleanupFiles(filePaths),
                totalImages: imageUrls.length,
                totalSizeMB: totalSize
            };

        } catch (error) {
            tfd.sysError('PixivImageOptimizer', `處理圖片附件失敗: ${error.message}`);
            return null; // 處理失敗，回到原本邏輯
        }
    }
}

module.exports = PixivImageAttachmentOptimizer;
