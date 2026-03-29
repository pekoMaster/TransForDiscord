/*jshint esversion: 9 */
/**
 * facebook-with-login.js
 * Facebook 提取器（使用已保存的登入狀態）
 * 結合 Playwright Semantic Browser 和持久化登入
 */

const PlaywrightSemanticBrowser = require('../../utils/playwright-semantic-browser');
const path = require('path');
const fs = require('fs').promises;
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { chromium = null; }

class FacebookWithLoginExtractor {
    constructor() {
        this.name = 'facebook_with_login';
        this.userDataDir = path.join(__dirname, '..', '..', 'data', 'facebook_session');
        this.context = null;
    }

    /**
     * 初始化持久化上下文
     */
    async initContext() {
        // 檢查是否有保存的登入狀態
        try {
            await fs.access(this.userDataDir);
        } catch {
            throw new Error('找不到 Facebook 登入狀態，請先執行: node utils/facebook-login-simple.js');
        }

        // 啟動持久化上下文
        this.context = await chromium.launchPersistentContext(this.userDataDir, {
            headless: true, // 背景執行
            channel: 'chrome',
            viewport: { width: 1280, height: 720 },
            locale: 'zh-TW',
            timeout: 30000
        });

        console.log('[FB Extractor] ✅ 使用已保存的登入狀態');
    }

    /**
     * 提取 Facebook 貼文內容
     * @param {string} url - Facebook 貼文 URL
     * @returns {Promise<Object>}
     */
    async extract(url, extractedData = {}, message = null) {
        try {
            console.log(`[FB Extractor] 開始提取: ${url}`);

            // 初始化上下文
            if (!this.context) {
                await this.initContext();
            }

            // 開啟新分頁
            const page = await this.context.newPage();

            console.log('[FB Extractor] 開啟頁面...');
            await page.goto(url, {
                waitUntil: 'domcontentloaded', // 不等 networkidle，太慢
                timeout: 30000
            });

            // 等待內容載入
            await page.waitForTimeout(3000);

            // 取得語義化快照
            console.log('[FB Extractor] 取得語義化快照...');
            const snapshot = await page.accessibility.snapshot();

            // 轉換為文字格式
            const lines = [];
            this._convertToLines(snapshot, lines, 0);
            const snapshotText = lines.join('\n');

            // 解析元素
            const elements = this._parseSnapshot(snapshotText);

            console.log(`[FB Extractor] 找到 ${elements.length} 個元素`);

            // 提取內容
            const result = {
                success: true,
                siteName: 'facebook',
                contentType: 'post',
                data: {
                    url,
                    author: this._extractAuthor(elements),
                    postTime: this._extractPostTime(elements),
                    content: this._extractContent(elements),
                    hashtags: this._extractHashtags(elements),
                    interactions: this._extractInteractions(elements),
                    comments: this._extractComments(elements),
                    images: await this._extractImages(page),
                    elementCount: elements.length
                }
            };

            // 截圖
            const screenshotPath = path.join(__dirname, '..', '..', 'temp', `fb-${Date.now()}.png`);
            await fs.mkdir(path.dirname(screenshotPath), { recursive: true }).catch(() => {});
            await page.screenshot({ path: screenshotPath, fullPage: false });
            result.data.screenshot = screenshotPath;

            console.log('[FB Extractor] ✅ 提取完成');
            console.log(`  作者: ${result.data.author}`);
            console.log(`  內容: ${result.data.content.substring(0, 100)}...`);
            console.log(`  留言: ${result.data.comments.length} 則`);
            console.log(`  圖片: ${result.data.images.length} 張`);

            await page.close();

            return result;

        } catch (error) {
            console.error('[FB Extractor] 錯誤:', error.message);

            return {
                success: false,
                siteName: 'facebook',
                error: error.message
            };
        }
    }

    /**
     * 提取作者資訊（改進版）
     */
    _extractAuthor(elements) {
        // 方法 1：找尋 heading 元素
        let authorElement = elements.find(el =>
            el.role === 'heading' &&
            !el.text.includes('貼文') &&
            !el.text.includes('留言') &&
            !el.text.includes('Facebook') &&
            el.text.length > 1 &&
            el.text.length < 50
        );

        if (authorElement) {
            return authorElement.text;
        }

        // 方法 2：找尋第一個有意義的 link（通常是作者名稱連結）
        authorElement = elements.find(el =>
            el.role === 'link' &&
            el.text.length > 1 &&
            el.text.length < 50 &&
            !el.text.includes('http') &&
            !el.text.includes('讚') &&
            !el.text.includes('留言') &&
            !el.text.includes('分享') &&
            !el.text.includes('更多') &&
            !el.text.includes('天前') &&
            !el.text.includes('小時') &&
            !el.text.includes('分鐘')
        );

        return authorElement ? authorElement.text : '未知作者';
    }

    /**
     * 提取發文時間
     */
    _extractPostTime(elements) {
        // 找尋時間相關的連結
        const timeElement = elements.find(el =>
            el.role === 'link' &&
            (el.text.includes('天') || el.text.includes('小時') || el.text.includes('分鐘'))
        );

        return timeElement ? timeElement.text : '';
    }

    /**
     * 提取貼文內容（改進版）
     */
    _extractContent(elements) {
        // 排除常見的 UI 文字
        const excludeTexts = [
            '登入', 'Cookie', 'Facebook', '查看更多',
            '所有留言', '最相關', '讚', '留言', '分享',
            '傳送', '表情', '貼圖', '相片', '影片',
            '隱私政策', '服務條款', '廣告', '建立帳號'
        ];

        const textElements = elements.filter(el => {
            // 必須是 text 或 StaticText
            if (el.role !== 'text' && el.role !== 'StaticText') return false;

            // 長度限制
            if (el.text.length < 5) return false;

            // 排除 UI 文字
            if (excludeTexts.some(ex => el.text.includes(ex))) return false;

            return true;
        });

        // 取最長的幾個文字段落（通常是貼文內容）
        const sortedTexts = textElements
            .sort((a, b) => b.text.length - a.text.length)
            .slice(0, 5);

        const content = sortedTexts.map(el => el.text).join('\n\n');

        return content || '（無法提取內容）';
    }

    /**
     * 提取 Hashtags
     */
    _extractHashtags(elements) {
        return elements
            .filter(el => el.role === 'link' && el.text.startsWith('#'))
            .map(el => el.text);
    }

    /**
     * 提取互動數據
     */
    _extractInteractions(elements) {
        const interactions = {
            likes: 0,
            comments: 0,
            shares: 0
        };

        elements.forEach(el => {
            if (el.role === 'button') {
                if (el.text.includes('讚：')) {
                    const match = el.text.match(/讚：(\d+)/);
                    if (match) interactions.likes = parseInt(match[1]);
                }
                if (el.text.includes('則留言')) {
                    const match = el.text.match(/(\d+)則留言/);
                    if (match) interactions.comments = parseInt(match[1]);
                }
                if (el.text.includes('次分享')) {
                    const match = el.text.match(/(\d+)次分享/);
                    if (match) interactions.shares = parseInt(match[1]);
                }
            }
        });

        return interactions;
    }

    /**
     * 提取留言
     */
    _extractComments(elements) {
        const comments = [];

        const articleElements = elements.filter(el => el.role === 'article');

        articleElements.forEach(article => {
            // 留言通常在 article 元素中
            const textInArticle = elements.filter(el =>
                el.role === 'text' &&
                el.text.length > 10
            );

            if (textInArticle.length > 0) {
                comments.push({
                    author: '', // 可以進一步解析
                    text: textInArticle[0].text,
                    time: ''
                });
            }
        });

        return comments.slice(0, 10); // 最多返回 10 則留言
    }

    /**
     * 提取圖片 URL（改進版：過濾無關圖片）
     */
    async _extractImages(page) {
        try {
            const images = await page.$$eval('img', imgs => {
                // 收集所有圖片資訊
                return imgs.map(img => {
                    const rect = img.getBoundingClientRect();
                    return {
                        src: img.src,
                        alt: img.alt || '',
                        width: rect.width,
                        height: rect.height,
                        // 檢查是否在貼文區域（通常在頁面中央）
                        centerX: rect.left + rect.width / 2,
                        // 檢查父元素是否包含特定 class
                        parentClass: img.parentElement?.className || '',
                        grandParentClass: img.parentElement?.parentElement?.className || ''
                    };
                });
            });

            // 過濾條件
            const filteredImages = images.filter(img => {
                // 必須有 src
                if (!img.src || !img.src.startsWith('http')) return false;

                // 排除小圖片（頭像、圖標等，通常 < 100px）
                if (img.width < 100 || img.height < 100) return false;

                // 排除 Facebook 系統圖片
                const excludePatterns = [
                    'static',
                    'icon',
                    'emoji',
                    'profile',
                    'avatar',
                    'rsrc.php',  // Facebook 資源檔
                    'safe_image.php',  // 外部連結預覽圖
                    '/ads/',
                    'sponsored',
                    'pixel',
                    'tracking',
                    '/a.png',  // 1x1 追蹤像素
                    'badge',
                    'logo'
                ];

                const srcLower = img.src.toLowerCase();
                if (excludePatterns.some(pattern => srcLower.includes(pattern))) {
                    return false;
                }

                // 必須是 scontent（Facebook CDN 貼文圖片）
                // 或是 fbcdn（Facebook 內容 CDN）
                if (!img.src.includes('scontent') && !img.src.includes('fbcdn')) {
                    return false;
                }

                return true;
            });

            console.log(`[FB Extractor] 圖片過濾: ${images.length} → ${filteredImages.length} 張`);

            return filteredImages.slice(0, 10); // 最多 10 張圖片

        } catch (error) {
            console.error('[FB Extractor] 圖片提取失敗:', error.message);
            return [];
        }
    }

    /**
     * 轉換 accessibility tree 為文字行
     */
    _convertToLines(node, lines, depth) {
        if (!node) return;

        const indent = '  '.repeat(depth);
        const role = node.role || 'unknown';
        const name = node.name || '';

        if (name) {
            const ref = `e${lines.length + 1}`;
            lines.push(`${indent}- ${role} "${name}" [ref=${ref}]`);
        }

        if (node.children) {
            node.children.forEach(child => {
                this._convertToLines(child, lines, depth + 1);
            });
        }
    }

    /**
     * 解析快照文字
     */
    _parseSnapshot(snapshot) {
        const lines = snapshot.split('\n');
        const elements = [];

        lines.forEach(line => {
            const match = line.match(/- (\w+) "([^"]+)" \[ref=(\w+)\]/);
            if (match) {
                elements.push({
                    role: match[1],
                    text: match[2],
                    ref: match[3]
                });
            }
        });

        return elements;
    }

    /**
     * 關閉上下文
     */
    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
            console.log('[FB Extractor] 上下文已關閉');
        }
    }
}

module.exports = FacebookWithLoginExtractor;
