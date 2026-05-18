/*jshint esversion: 9 */
/**
 * dynamic.js - 動態網站提取器
 * 使用 Playwright Semantic Browser 處理需要 JavaScript 渲染的網站
 *
 * 適用於：
 * - Instagram（動態載入的圖片）
 * - Twitter 引用推文（需要展開）
 * - 其他 SPA (Single Page Application)
 */

const PlaywrightSemanticBrowser = require('../../shared/browser/playwright-semantic-browser');
const path = require('path');
const tfd = require('../../shared/logging/tfd-logger');

class DynamicExtractor {
    constructor() {
        this.name = 'dynamic';
        this.browser = null;
    }

    /**
     * 提取動態網站內容
     * @param {string} url - 目標 URL
     * @param {Object} extractedData - 已提取的資料（選填）
     * @param {Object} message - Discord 訊息物件（選填）
     * @returns {Promise<Object>}
     */
    async extract(url, extractedData = {}, message = null) {
        try {
            // 初始化瀏覽器
            if (!this.browser) {
                this.browser = new PlaywrightSemanticBrowser({
                    headless: true,
                    timeout: 30000,
                    debug: false
                });
            }

            tfd.sys('Dynamic Extractor', `處理: ${url}`);

            // 開啟頁面
            await this.browser.open(url);
            await this.browser.waitForLoad();

            // 等待動態內容載入
            await this._sleep(2000);

            // 取得語義化快照
            const snapshot = await this.browser.snapshot();
            const elements = this.browser.parseSnapshot(snapshot);

            tfd.sys('Dynamic Extractor', `找到 ${elements.length} 個元素`);

            // 提取圖片
            const images = await this._extractImages(elements);

            // 提取文字內容
            const textContent = await this._extractText(elements);

            // 提取連結
            const links = this._extractLinks(elements);

            // 截圖（用於 fallback）
            const timestamp = Date.now();
            const screenshotPath = path.join(__dirname, `../../../temp/dynamic-${timestamp}.png`);

            // 確保 temp 目錄存在
            const fs = require('fs').promises;
            await fs.mkdir(path.dirname(screenshotPath), { recursive: true }).catch(() => {});

            await this.browser.screenshot(screenshotPath);

            // 取得頁面標題
            const title = await this._getPageTitle(elements);

            tfd.sys('Dynamic Extractor', `✅ 提取完成: ${images.length} 張圖片, ${links.length} 個連結`);

            return {
                success: true,
                siteName: 'dynamic',
                contentType: 'webpage',
                data: {
                    url,
                    title,
                    images,
                    textContent,
                    links,
                    screenshot: screenshotPath,
                    elementCount: elements.length
                }
            };

        } catch (error) {
            tfd.sysError('Dynamic Extractor', `錯誤: ${error.message}`);

            return {
                success: false,
                siteName: 'dynamic',
                error: error.message
            };

        } finally {
            // 不關閉瀏覽器，保持重用以提升效能
            // 可以在系統關閉時統一關閉
        }
    }

    /**
     * 提取圖片
     * @private
     */
    async _extractImages(elements) {
        const images = [];

        // 從語義化元素中查找圖片
        for (const el of elements) {
            if (el.role === 'img' && el.text) {
                // text 可能包含 alt 文字或 src
                images.push({
                    alt: el.text,
                    ref: el.ref
                });
            }
        }

        // 如果語義化方式找不到圖片，使用傳統方式
        if (images.length === 0 && this.browser.page) {
            try {
                const imgElements = await this.browser.page.$$('img');
                for (const img of imgElements) {
                    const src = await img.getAttribute('src');
                    const alt = await img.getAttribute('alt');
                    if (src) {
                        images.push({ src, alt });
                    }
                }
            } catch (error) {
                tfd.sysError('Dynamic Extractor', `傳統圖片提取失敗: ${error.message}`);
            }
        }

        return images;
    }

    /**
     * 提取文字內容
     * @private
     */
    async _extractText(elements) {
        const textElements = elements.filter(el =>
            ['text', 'paragraph', 'heading'].includes(el.role) &&
            el.text &&
            el.text.length > 10
        );

        return textElements.map(el => ({
            role: el.role,
            text: el.text
        }));
    }

    /**
     * 提取連結
     * @private
     */
    _extractLinks(elements) {
        return elements
            .filter(el => el.role === 'link' && el.text)
            .map(el => ({
                text: el.text,
                ref: el.ref
            }));
    }

    /**
     * 取得頁面標題
     * @private
     */
    async _getPageTitle(elements) {
        const heading = elements.find(el => el.role === 'heading');
        if (heading) {
            return heading.text;
        }

        // Fallback: 使用瀏覽器 title
        if (this.browser.page) {
            try {
                return await this.browser.page.title();
            } catch {
                return '';
            }
        }

        return '';
    }

    /**
     * 延遲
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 關閉瀏覽器（清理資源）
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            tfd.sys('Dynamic Extractor', '瀏覽器已關閉');
        }
    }

    /**
     * 建立錯誤回應
     * @private
     */
    _createErrorResponse(message, url) {
        return {
            success: false,
            siteName: 'dynamic',
            error: message,
            data: { url }
        };
    }
}

module.exports = DynamicExtractor;
