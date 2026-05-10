/**
 * IWARA 影片資訊提取器
 * 使用 Puppeteer 爬蟲技術提取完整影片資訊
 */

const puppeteer = require('puppeteer');

class IwaraExtractor {
    constructor() {
        this.timeout = 30000;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    /**
     * 檢查是否為 IWARA URL
     */
    isIwaraURL(url) {
        const iwaraPattern = /https?:\/\/(?:www\.)?iwara\.tv\/video\/[a-zA-Z0-9]+(?:\/[^\/]*)?/i;
        return iwaraPattern.test(url);
    }

    /**
     * 提取影片 ID
     */
    extractVideoId(url) {
        const match = url.match(/iwara\.tv\/video\/([a-zA-Z0-9]+)/i);
        return match ? match[1] : null;
    }

    /**
     * 啟動瀏覽器
     */
    async initBrowser() {
        try {
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                timeout: this.timeout
            });

            this.page = await this.browser.newPage();
            await this.page.setUserAgent(this.userAgent);
            await this.page.setViewport({ width: 1920, height: 1080 });

            return true;
        } catch (error) {
            console.error('[IWARA Extractor] 瀏覽器初始化失敗:', error.message);
            return false;
        }
    }

    /**
     * 提取完整影片資訊
     */
    async extractVideoInfo(url) {
        const startTime = Date.now();
        console.log(`[IWARA Extractor] 開始提取: ${url}`);

        try {
            // 檢查 URL 格式
            if (!this.isIwaraURL(url)) {
                throw new Error('不是有效的 IWARA 影片 URL');
            }

            const videoId = this.extractVideoId(url);
            if (!videoId) {
                throw new Error('無法提取影片 ID');
            }

            // 初始化瀏覽器
            const browserReady = await this.initBrowser();
            if (!browserReady) {
                throw new Error('瀏覽器初始化失敗');
            }

            // 載入影片頁面
            const response = await this.page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: this.timeout
            });

            if (!response.ok()) {
                throw new Error(`頁面載入失敗，狀態碼: ${response.status()}`);
            }

            // 等待頁面載入
            try {
                await this.page.waitForSelector('h1, .video-title', { timeout: 10000 });
            } catch (waitError) {
                console.warn('[IWARA Extractor] 核心元素載入超時，繼續進行');
            }

            // 監聽影片相關網路請求
            const videoRequests = [];
            this.page.on('response', response => {
                const requestURL = response.url();
                if (requestURL.includes('.mp4') || requestURL.includes('.m3u8') ||
                    requestURL.includes('view?filename') || requestURL.includes('iwara.tv/view')) {
                    videoRequests.push({
                        url: requestURL,
                        status: response.status(),
                        contentType: response.headers()['content-type']
                    });
                }
            });

            // 提取頁面資訊
            const extractedData = await this.page.evaluate(() => {
                const data = {};

                // 標題提取
                const titleSelectors = ['h1', '.video-title', '[data-testid="video-title"]', '.title'];
                for (const selector of titleSelectors) {
                    const element = document.querySelector(selector);
                    if (element && element.textContent.trim()) {
                        data.title = element.textContent.trim();
                        break;
                    }
                }

                // 作者提取
                const authorSelectors = ['.author-name', '.username', '[data-testid="author-name"]', '.user-name', '.creator-name'];
                for (const selector of authorSelectors) {
                    const element = document.querySelector(selector);
                    if (element && element.textContent.trim()) {
                        data.author = element.textContent.trim();
                        break;
                    }
                }

                // 作者頭像
                const avatarSelectors = ['.author-avatar img', '.user-avatar img', '.creator-avatar img', '[data-testid="author-avatar"] img'];
                for (const selector of avatarSelectors) {
                    const element = document.querySelector(selector);
                    if (element && element.src) {
                        data.authorAvatar = element.src;
                        break;
                    }
                }

                // 觀看次數
                const viewSelectors = ['.view-count', '.views', '[data-testid="view-count"]'];
                for (const selector of viewSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const text = element.textContent.trim();
                        const match = text.match(/[\d,]+/);
                        if (match) {
                            data.views = parseInt(match[0].replace(/,/g, ''));
                            break;
                        }
                    }
                }

                // 按讚數
                const likeSelectors = ['.like-count', '.likes', '[data-testid="like-count"]'];
                for (const selector of likeSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const text = element.textContent.trim();
                        const match = text.match(/[\d,]+/);
                        if (match) {
                            data.likes = parseInt(match[0].replace(/,/g, ''));
                            break;
                        }
                    }
                }

                // 縮圖
                const thumbnailSelectors = ['video[poster]', '.video-thumbnail img', '.thumbnail img', 'meta[property="og:image"]'];
                for (const selector of thumbnailSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        if (element.tagName === 'VIDEO' && element.poster) {
                            data.thumbnail = element.poster;
                            break;
                        } else if (element.tagName === 'IMG' && element.src) {
                            data.thumbnail = element.src;
                            break;
                        } else if (element.tagName === 'META' && element.content) {
                            data.thumbnail = element.content;
                            break;
                        }
                    }
                }

                // 從頁面 DOM 中尋找影片 URL
                const videoURLs = [];
                const videoElements = document.querySelectorAll('video');
                videoElements.forEach(video => {
                    if (video.src) videoURLs.push(video.src);
                    if (video.currentSrc) videoURLs.push(video.currentSrc);

                    const sources = video.querySelectorAll('source');
                    sources.forEach(source => {
                        if (source.src) videoURLs.push(source.src);
                    });
                });

                // 檢查腳本中的影片 URL
                const scripts = document.querySelectorAll('script');
                scripts.forEach(script => {
                    if (script.textContent) {
                        const content = script.textContent;
                        const mp4Matches = content.match(/https?:\/\/[^"'\\s]*\.mp4[^"'\\s]*/g);
                        if (mp4Matches) videoURLs.push(...mp4Matches);

                        const m3u8Matches = content.match(/https?:\/\/[^"'\\s]*\.m3u8[^"'\\s]*/g);
                        if (m3u8Matches) videoURLs.push(...m3u8Matches);
                    }
                });

                data.videoURLs = [...new Set(videoURLs)];
                return data;
            });

            // 等待一下讓網路請求完成
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 整理縮圖 URL
            if (extractedData.thumbnail && extractedData.thumbnail.startsWith('//')) {
                extractedData.thumbnail = 'https:' + extractedData.thumbnail;
            }

            // 整理作者頭像 URL
            if (extractedData.authorAvatar && extractedData.authorAvatar.startsWith('//')) {
                extractedData.authorAvatar = 'https:' + extractedData.authorAvatar;
            }

            // 選擇最佳的影片 URL（優先選擇非預覽版本）
            let bestVideoURL = null;
            if (extractedData.videoURLs.length > 0) {
                // 優先選擇不包含 'preview' 的 URL
                const nonPreviewURLs = extractedData.videoURLs.filter(url => !url.includes('preview'));
                bestVideoURL = nonPreviewURLs.length > 0 ? nonPreviewURLs[0] : extractedData.videoURLs[0];
            }

            const result = {
                success: true,
                videoId: videoId,
                originalURL: url,
                title: extractedData.title || '未知標題',
                author: extractedData.author || '未知作者',
                authorAvatar: extractedData.authorAvatar || null,
                views: extractedData.views || 0,
                likes: extractedData.likes || 0,
                thumbnail: extractedData.thumbnail || null,
                videoURL: bestVideoURL,
                allVideoURLs: extractedData.videoURLs,
                extractionTime: Date.now() - startTime
            };

            console.log(`[IWARA Extractor] 提取完成，耗時: ${result.extractionTime}ms`);
            await this.cleanup();
            return result;

        } catch (error) {
            console.error('[IWARA Extractor] 提取失敗:', error.message);
            await this.cleanup();
            return {
                success: false,
                error: error.message,
                videoId: this.extractVideoId(url),
                originalURL: url,
                extractionTime: Date.now() - startTime
            };
        }
    }

    /**
     * 生成 Discord Embed 格式
     */
    generateEmbed(extractedData) {
        if (!extractedData.success) {
            return {
                color: 0xff0000,
                title: '❌ IWARA 影片提取失敗',
                description: `錯誤: ${extractedData.error}`,
                url: extractedData.originalURL,
                timestamp: new Date().toISOString()
            };
        }

        const embed = {
            color: 0x1DA1F2,
            title: extractedData.title,
            url: extractedData.originalURL,
            description: `👤 **作者**: ${extractedData.author}\n` +
                        `👀 **觀看次數**: ${extractedData.views.toLocaleString()}\n` +
                        `👍 **按讚數**: ${extractedData.likes.toLocaleString()}`,
            thumbnail: {
                url: extractedData.thumbnail
            },
            fields: [],
            timestamp: new Date().toISOString(),
            footer: {
                text: `IWARA • ID: ${extractedData.videoId} • 提取耗時: ${extractedData.extractionTime}ms`
            }
        };

        // 如果有影片 URL，添加到描述中
        if (extractedData.videoURL) {
            embed.fields.push({
                name: '🎬 影片連結',
                value: `[點擊觀看影片](${extractedData.videoURL})`,
                inline: true
            });
        }

        // 如果有作者頭像，設置 author 欄位
        if (extractedData.authorAvatar) {
            embed.author = {
                name: extractedData.author,
                icon_url: extractedData.authorAvatar
            };
        }

        return embed;
    }

    /**
     * 清理資源
     */
    async cleanup() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
            }
        } catch (error) {
            console.error('[IWARA Extractor] 清理資源時發生錯誤:', error.message);
        }
    }
}

module.exports = IwaraExtractor;