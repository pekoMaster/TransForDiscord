/**
 * Twitter 多圖片附件優化器
 * 將純多圖片推文的所有圖片作為附件，取代分頁按鈕
 */

const { AttachmentBuilder } = require('discord.js');
const https = require('https');
const fs = require('fs');
const path = require('path');
const tfd = require('../../utils/tfd-logger');

class TwitterImageAttachmentOptimizer {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.ensureTempDir();

        // 測試推文ID（針對你提供的URL）
        this.testTweetId = '1970070380284109239';
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * 檢查推文是否需要多圖片附件優化
     */
    shouldOptimize(tweetId, tweetType) {
        // 目前只針對特定的測試 URL 和 multi-image 類型
        return tweetId === this.testTweetId && tweetType === 'multi-image';
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
                const isSmallEnough = sizeMB <= 8; // Discord 單圖限制 8MB

                return {
                    suitable: isSmallEnough,
                    sizeMB: sizeMB,
                    sizeBytes: parseInt(contentLength),
                    contentType: response.headers['content-type']
                };
            }

            return { suitable: false, sizeMB: 0, sizeBytes: 0 };
        } catch (error) {
            tfd.sysError('ImageOptimizer', `檢查圖片失敗: ${error.message}`);
            return { suitable: false, sizeMB: 0, sizeBytes: 0 };
        }
    }

    /**
     * 發送 HEAD 請求檢查檔案大小
     */
    makeHeadRequest(url) {
        return new Promise((resolve, reject) => {
            const request = https.request(url, { method: 'HEAD' }, (response) => {
                resolve(response);
            });

            request.on('error', reject);
            request.setTimeout(5000, () => {
                request.destroy();
                reject(new Error('請求超時'));
            });

            request.end();
        });
    }

    /**
     * 下載圖片作為附件
     */
    async downloadImageAsAttachment(imageUrl, tweetId, index) {
        tfd.sys('ImageOptimizer', `開始下載圖片 ${index + 1}: ${imageUrl}`);

        const extension = this.getImageExtension(imageUrl);
        const fileName = `twitter_image_${tweetId}_${index + 1}.${extension}`;
        const filePath = path.join(this.tempDir, fileName);

        try {
            await this.downloadFile(imageUrl, filePath);

            const attachment = new AttachmentBuilder(filePath, {
                name: fileName,
                description: `推文圖片 ${index + 1}`
            });

            tfd.sys('ImageOptimizer', `✅ 圖片 ${index + 1} 下載完成: ${fileName}`);

            return {
                attachment,
                filePath,
                fileName
            };

        } catch (error) {
            tfd.sysError('ImageOptimizer', `下載圖片 ${index + 1} 失敗: ${error.message}`);
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
            const file = fs.createWriteStream(filePath);

            const request = https.get(url, (response) => {
                if (response.statusCode !== 200) {
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
                tfd.sys('ImageOptimizer', `🗑️ 臨時檔案已清理: ${path.basename(filePath)}`);
            }
        } catch (error) {
            tfd.sysError('ImageOptimizer', `清理檔案失敗: ${error.message}`);
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
     */
    async processImageAttachmentOptimization(tweet, originalURL, tweetType) {
        const tweetId = tweet.id;

        // 檢查是否需要優化
        if (!this.shouldOptimize(tweetId, tweetType)) {
            return null; // 不需要優化，使用原本邏輯
        }

        tfd.sys('ImageOptimizer', `🎯 針對多圖片推文進行附件優化: ${tweetId}`);

        // 提取圖片
        const images = [];
        if (tweet.media && tweet.media.all) {
            tweet.media.all.forEach(media => {
                if (media && media.type !== 'video' && media.url) {
                    images.push(media);
                }
            });
        }

        if (images.length === 0) {
            return null; // 沒有圖片
        }

        tfd.sys('ImageOptimizer', `找到 ${images.length} 張圖片`);

        try {
            const attachments = [];
            const filePaths = [];
            let totalSize = 0;

            // 檢查所有圖片的適合性
            for (let i = 0; i < images.length; i++) {
                const image = images[i];
                const suitability = await this.checkImageSuitability(image.url);

                if (!suitability.suitable) {
                    tfd.sys('ImageOptimizer', `圖片 ${i + 1} 太大或檢查失敗，跳過附件優化`);
                    return null; // 如果有任何圖片不適合，回到原本邏輯
                }

                totalSize += suitability.sizeMB;
            }

            // Discord 總附件大小限制約 25MB
            if (totalSize > 20) {
                tfd.sys('ImageOptimizer', `總大小太大 (${totalSize.toFixed(2)}MB)，跳過附件優化`);
                return null;
            }

            tfd.sys('ImageOptimizer', `總大小: ${totalSize.toFixed(2)}MB，開始下載所有圖片...`);

            // 下載所有圖片作為附件
            for (let i = 0; i < images.length; i++) {
                const image = images[i];
                const result = await this.downloadImageAsAttachment(image.url, tweetId, i);
                attachments.push(result.attachment);
                filePaths.push(result.filePath);
            }

            tfd.sys('ImageOptimizer', `✅ 成功下載 ${attachments.length} 張圖片作為附件`);

            return {
                hasImageAttachments: true,
                imageAttachments: attachments,
                cleanup: () => this.cleanupFiles(filePaths),
                totalImages: images.length,
                totalSizeMB: totalSize
            };

        } catch (error) {
            tfd.sysError('ImageOptimizer', `處理圖片附件失敗: ${error.message}`);
            return null; // 處理失敗，回到原本邏輯
        }
    }
}

module.exports = TwitterImageAttachmentOptimizer;