/*jshint esversion: 9 */
/**
 * facebook-mbasic.js
 * Facebook 提取器（基於 mbasic.facebook.com）
 *
 * 參考 kevinzg/facebook-scraper 的邏輯
 * 使用 mbasic（精簡版 Facebook）更容易解析 HTML
 */

let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { chromium = null; }
const path = require('path');
const fs = require('fs').promises;

// Facebook URL 常數
const FB_MBASIC_BASE_URL = 'https://mbasic.facebook.com';
const FB_MOBILE_BASE_URL = 'https://m.facebook.com';

class FacebookMBasicExtractor {
    constructor() {
        this.name = 'facebook_mbasic';
        this.userDataDir = path.join(__dirname, '..', '..', 'data', 'facebook_session');
        this.context = null;
    }

    /**
     * 初始化持久化上下文
     */
    async initContext() {
        try {
            await fs.access(this.userDataDir);
        } catch {
            throw new Error('找不到 Facebook 登入狀態，請先執行登入');
        }

        this.context = await chromium.launchPersistentContext(this.userDataDir, {
            headless: true,
            channel: 'chrome',
            viewport: { width: 480, height: 800 }, // 手機版尺寸
            userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
            locale: 'zh-TW',
            timeout: 30000
        });

        console.log('[FB MBasic] ✅ 使用已保存的登入狀態');
    }

    /**
     * 將標準 Facebook URL 轉換為 mbasic URL
     */
    convertToMBasicUrl(url) {
        // 標準化 URL
        let mbasicUrl = url
            .replace('www.facebook.com', 'mbasic.facebook.com')
            .replace('m.facebook.com', 'mbasic.facebook.com')
            .replace('web.facebook.com', 'mbasic.facebook.com')
            .replace('facebook.com', 'mbasic.facebook.com');

        // 處理分享連結格式 /share/p/XXX/
        const shareMatch = url.match(/\/share\/p\/([^/]+)/);
        if (shareMatch) {
            // 分享連結需要轉換成貼文連結格式
            // 先用原始 URL，讓它自動重定向
            mbasicUrl = url.replace(/www\.|m\.|web\./g, '').replace('facebook.com', 'mbasic.facebook.com');
        }

        return mbasicUrl;
    }

    /**
     * 提取 Facebook 貼文內容
     */
    async extract(url, extractedData = {}, message = null) {
        let page = null;

        try {
            console.log(`[FB MBasic] 開始提取: ${url}`);

            if (!this.context) {
                await this.initContext();
            }

            page = await this.context.newPage();

            // 轉換為 mbasic URL
            const mbasicUrl = this.convertToMBasicUrl(url);
            console.log(`[FB MBasic] 轉換 URL: ${mbasicUrl}`);

            await page.goto(mbasicUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // 等待內容載入
            await page.waitForTimeout(2000);

            // 取得最終 URL（可能經過重定向）
            const finalUrl = page.url();
            console.log(`[FB MBasic] 最終 URL: ${finalUrl}`);

            // 提取內容
            const result = await page.evaluate(() => {
                const data = {
                    author: null,
                    authorLink: null,
                    content: null,
                    images: [],
                    video: null,
                    timestamp: null,
                    reactions: null,
                    comments: null,
                    shares: null
                };

                // ==================== 作者提取 ====================
                // mbasic 的作者通常在 header 或 h3 中
                const authorSelectors = [
                    'h3 strong a',
                    'header h3 a',
                    'a.actor-link',
                    '#m_story_permalink_view h3 a',
                    'article header a',
                    'div[data-ft] h3 a'
                ];

                for (const selector of authorSelectors) {
                    const el = document.querySelector(selector);
                    if (el && el.textContent.trim()) {
                        data.author = el.textContent.trim();
                        data.authorLink = el.href || null;
                        break;
                    }
                }

                // ==================== 內容提取 ====================
                // mbasic 的貼文內容
                const contentSelectors = [
                    '.story_body_container',
                    'div[data-ft] > div > div',
                    '#m_story_permalink_view p',
                    'article p',
                    '.msg'
                ];

                let contentText = '';
                for (const selector of contentSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        const texts = [];
                        elements.forEach(el => {
                            // 排除 UI 文字
                            const text = el.textContent.trim();
                            if (text &&
                                !text.includes('讚') &&
                                !text.includes('留言') &&
                                !text.includes('分享') &&
                                !text.includes('更多') &&
                                text.length > 5) {
                                texts.push(text);
                            }
                        });
                        if (texts.length > 0) {
                            contentText = texts.join('\n');
                            break;
                        }
                    }
                }
                data.content = contentText || null;

                // ==================== 圖片提取（關鍵改進） ====================
                // 排除頭像 .profpic，只取貼文圖片
                const imageSelectors = [
                    'img.img:not(.profpic)',              // mbasic 貼文圖片
                    'img[data-sigil="photo-image"]',      // 照片標籤
                    'a[href*="photo.php"] img',           // 相冊連結中的圖片
                    'a[href*="/photos/"] img',            // 照片連結中的圖片
                    'div[data-ft] img:not(.profpic)'      // 貼文區域圖片
                ];

                const seenUrls = new Set();
                const images = [];

                for (const selector of imageSelectors) {
                    const imgs = document.querySelectorAll(selector);
                    imgs.forEach(img => {
                        let src = img.src || img.getAttribute('data-src');
                        if (!src) return;

                        // 排除小圖和系統圖片
                        const width = img.naturalWidth || img.width || 0;
                        const height = img.naturalHeight || img.height || 0;

                        // 排除條件
                        if (width > 0 && width < 100) return;
                        if (height > 0 && height < 100) return;
                        if (src.includes('rsrc.php')) return;      // Facebook 資源檔
                        if (src.includes('emoji')) return;          // 表情符號
                        if (src.includes('static')) return;         // 靜態資源
                        if (src.includes('/p50x50/')) return;       // 小縮圖
                        if (src.includes('/p75x225/')) return;      // 小縮圖
                        if (src.includes('_s.')) return;            // 小圖後綴

                        // 必須是 Facebook CDN
                        if (!src.includes('scontent') && !src.includes('fbcdn')) return;

                        // 去重
                        if (seenUrls.has(src)) return;
                        seenUrls.add(src);

                        images.push({
                            src: src,
                            width: width,
                            height: height
                        });
                    });
                }

                // 按尺寸排序，大圖優先
                images.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                data.images = images.slice(0, 10); // 最多 10 張

                // ==================== 高解析度圖片連結 ====================
                // 嘗試取得 photo.php 連結以獲取高解析度版本
                const photoLinks = document.querySelectorAll('a[href*="photo.php"]');
                const hdImageUrls = [];
                photoLinks.forEach(link => {
                    const href = link.href;
                    if (href && !hdImageUrls.includes(href)) {
                        hdImageUrls.push(href);
                    }
                });
                data.photoLinks = hdImageUrls.slice(0, 10);

                // ==================== 時間提取 ====================
                const timeSelectors = [
                    'abbr',
                    'time',
                    'a[href*="/story.php"] abbr',
                    'header abbr'
                ];

                for (const selector of timeSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        data.timestamp = el.textContent.trim() || el.getAttribute('title');
                        break;
                    }
                }

                // ==================== 互動數據 ====================
                // mbasic 格式：「讚 · 留言」
                const footerText = document.querySelector('footer')?.textContent || '';
                const statsText = document.querySelector('#m_story_permalink_view')?.textContent || '';
                const fullText = footerText + ' ' + statsText;

                // 提取數字
                const likesMatch = fullText.match(/(\d+)\s*個?讚/);
                const commentsMatch = fullText.match(/(\d+)\s*則?留言/);
                const sharesMatch = fullText.match(/(\d+)\s*次?分享/);

                data.reactions = likesMatch ? parseInt(likesMatch[1]) : 0;
                data.comments = commentsMatch ? parseInt(commentsMatch[1]) : 0;
                data.shares = sharesMatch ? parseInt(sharesMatch[1]) : 0;

                return data;
            });

            // 如果有 photo.php 連結，嘗試提取高解析度圖片
            if (result.photoLinks && result.photoLinks.length > 0 && result.images.length === 0) {
                console.log(`[FB MBasic] 嘗試從 photo.php 提取高解析度圖片...`);
                const hdImages = await this._extractHDImages(page, result.photoLinks);
                if (hdImages.length > 0) {
                    result.images = hdImages;
                }
            }

            console.log('[FB MBasic] ✅ 提取完成');
            console.log(`  作者: ${result.author}`);
            console.log(`  內容: ${result.content?.substring(0, 50)}...`);
            console.log(`  圖片: ${result.images.length} 張`);
            console.log(`  互動: ${result.reactions} 讚, ${result.comments} 留言`);

            await page.close();

            return {
                success: true,
                siteName: 'facebook',
                contentType: 'post',
                data: {
                    url: url,
                    author: result.author || '未知作者',
                    authorLink: result.authorLink,
                    content: result.content || '',
                    images: result.images,
                    timestamp: result.timestamp,
                    interactions: {
                        likes: result.reactions,
                        comments: result.comments,
                        shares: result.shares
                    }
                },
                // 供 message-handler 使用
                multipleImages: result.images.map(img => img.src)
            };

        } catch (error) {
            console.error('[FB MBasic] 錯誤:', error.message);

            if (page) {
                await page.close().catch(() => {});
            }

            return {
                success: false,
                siteName: 'facebook',
                error: error.message
            };
        }
    }

    /**
     * 從 photo.php 頁面提取高解析度圖片
     */
    async _extractHDImages(page, photoLinks) {
        const hdImages = [];

        for (const photoUrl of photoLinks.slice(0, 5)) { // 最多處理 5 個連結
            try {
                await page.goto(photoUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 10000
                });
                await page.waitForTimeout(1000);

                const hdSrc = await page.evaluate(() => {
                    // mbasic photo.php 頁面的高解析度圖片
                    const selectors = [
                        'img.img:not(.profpic)',
                        'a[href*="fbcdn"] img',
                        'img[src*="scontent"]'
                    ];

                    for (const sel of selectors) {
                        const img = document.querySelector(sel);
                        if (img && img.src && img.src.includes('scontent')) {
                            return img.src;
                        }
                    }

                    // 嘗試從「查看完整大小」連結取得
                    const fullSizeLink = document.querySelector('a[href*="scontent"]');
                    if (fullSizeLink) {
                        return fullSizeLink.href;
                    }

                    return null;
                });

                if (hdSrc) {
                    hdImages.push({ src: hdSrc, width: 0, height: 0 });
                }

            } catch (err) {
                console.warn(`[FB MBasic] 無法提取高解析度圖片: ${err.message}`);
            }
        }

        return hdImages;
    }

    /**
     * 關閉上下文
     */
    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
            console.log('[FB MBasic] 上下文已關閉');
        }
    }
}

module.exports = FacebookMBasicExtractor;
