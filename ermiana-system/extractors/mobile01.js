/**
 * Mobile01 論壇提取器
 * 使用 Puppeteer 繞過 Akamai CDN 防護
 */

const { EmbedBuilder } = require('discord.js');
let puppeteer; try { puppeteer = require('puppeteer'); } catch (_) { puppeteer = null; }

class Mobile01Extractor {
    constructor() {
        this.name = 'Mobile01';
        this.iconURL = 'https://attach2.mobile01.com/images/logo/logo.png';
        this.browser = null;
        this.browserTimeout = 60000; // 60秒後關閉瀏覽器
        this.browserTimer = null;
    }

    /**
     * 獲取或創建瀏覽器實例
     */
    async getBrowser() {
        // 重置關閉計時器
        if (this.browserTimer) {
            clearTimeout(this.browserTimer);
        }

        // 設定新的關閉計時器
        this.browserTimer = setTimeout(async () => {
            if (this.browser) {
                console.log('[Mobile01] 瀏覽器閒置超時，關閉中...');
                await this.browser.close();
                this.browser = null;
            }
        }, this.browserTimeout);

        // 如果瀏覽器已存在且連接中，直接返回
        if (this.browser && this.browser.isConnected()) {
            return this.browser;
        }

        // 創建新的瀏覽器實例
        console.log('[Mobile01] 啟動瀏覽器...');
        this.browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        return this.browser;
    }

    /**
     * 提取 Mobile01 文章資訊
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { originalURL, extractedData } = matchResult;
        const { topicId, forumId, page } = extractedData;

        console.log(`[Mobile01] 開始提取: topicId=${topicId}, forumId=${forumId}, page=${page || 1}`);

        try {
            const browser = await this.getBrowser();
            const pageInstance = await browser.newPage();

            try {
                // 設定 User-Agent
                await pageInstance.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                // 訪問頁面
                await pageInstance.goto(originalURL, {
                    waitUntil: 'networkidle2',
                    timeout: 20000
                });

                // 提取資訊
                const data = await pageInstance.evaluate(() => {
                    // 文章標題
                    const titleEl = document.querySelector('h1');
                    const title = titleEl ? titleEl.innerText.trim() : null;

                    // 作者 - 從第一個文章區塊提取
                    let author = null;
                    const authorLink = document.querySelector('.l-articlePage__author a[href*="userinfo"]');
                    if (authorLink) {
                        author = authorLink.innerText.trim();
                    } else {
                        // 備用：從 meta 標籤提取
                        const authorMeta = document.querySelector('meta[property="dable:author"]');
                        if (authorMeta) {
                            author = authorMeta.getAttribute('content');
                        }
                    }

                    // 圖片 - 文章內的圖片
                    const images = [];
                    const articleImages = document.querySelectorAll('article img');
                    articleImages.forEach(img => {
                        const src = img.src || img.dataset.src;
                        if (src &&
                            src.includes('attach.mobile01.com') &&
                            !src.includes('avatar') &&
                            !src.includes('icon')) {
                            images.push(src);
                        }
                    });

                    // 文章內容摘要（第一篇文章）
                    let content = null;
                    const firstArticle = document.querySelector('article');
                    if (firstArticle) {
                        // 移除引用區塊
                        const clone = firstArticle.cloneNode(true);
                        clone.querySelectorAll('blockquote').forEach(el => el.remove());
                        content = clone.innerText.trim().substring(0, 300);
                    }

                    // 發布時間
                    const timeMeta = document.querySelector('meta[property="article:published_time"]');
                    const publishTime = timeMeta ? timeMeta.getAttribute('content') : null;

                    // 分類
                    const sectionMeta = document.querySelector('meta[property="article:section"]');
                    const section = sectionMeta ? sectionMeta.getAttribute('content') : null;

                    return { title, author, images, content, publishTime, section };
                });

                await pageInstance.close();

                if (!data.title) {
                    throw new Error('無法獲取文章標題');
                }

                console.log(`[Mobile01] 提取成功: ${data.title}`);

                // 構建 Embed
                return this.createResponse(data, originalURL, page);

            } catch (error) {
                await pageInstance.close();
                throw error;
            }

        } catch (error) {
            console.error(`[Mobile01] 提取失敗: ${error.message}`);
            return {
                success: false,
                error: error.message,
                siteName: 'mobile01'
            };
        }
    }

    /**
     * 創建回應
     */
    createResponse(data, originalURL, page) {
        const embed = new EmbedBuilder()
            .setColor(0x0066CC)
            .setTitle(data.title)
            .setURL(originalURL)
            .setAuthor({
                name: 'Mobile01',
                iconURL: this.iconURL,
                url: 'https://www.mobile01.com'
            });

        // 描述
        if (data.content) {
            let description = data.content;
            if (description.length > 250) {
                description = description.substring(0, 250) + '...';
            }
            embed.setDescription(description);
        }

        // 欄位
        const fields = [];

        if (data.author) {
            fields.push({
                name: '作者',
                value: data.author,
                inline: true
            });
        }

        if (data.section) {
            fields.push({
                name: '分類',
                value: data.section,
                inline: true
            });
        }

        if (page && page > 1) {
            fields.push({
                name: '頁數',
                value: `第 ${page} 頁`,
                inline: true
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // 圖片
        if (data.images && data.images.length > 0) {
            embed.setImage(data.images[0]);
        }

        // Footer
        let footerText = 'Mobile01 論壇';
        if (data.publishTime) {
            const date = new Date(data.publishTime);
            footerText += ` • ${date.toLocaleDateString('zh-TW')}`;
        }
        if (data.images.length > 1) {
            footerText += ` • 共 ${data.images.length} 張圖片`;
        }
        embed.setFooter({ text: footerText });

        // 多圖片支援
        let multipleImages = null;
        if (data.images.length >= 2 && data.images.length <= 4) {
            multipleImages = data.images;
        }

        return {
            success: true,
            embed: embed,
            siteName: 'mobile01',
            contentType: 'forum_post',
            multipleImages: multipleImages,
            data: data
        };
    }
}

module.exports = Mobile01Extractor;
