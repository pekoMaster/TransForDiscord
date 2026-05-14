/*jshint esversion: 9 */
/**
 * playwright-semantic-browser.js
 * 基於現有 Playwright 的語義化瀏覽器包裝器
 *
 * 提供類似 Agent Browser 的語義化元素定位功能，
 * 但使用專案中已安裝的 Playwright，避免版本衝突
 */

const { chromium } = require('playwright');

class PlaywrightSemanticBrowser {
    constructor(options = {}) {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.elementRefs = new Map(); // 儲存元素參考 @e1, @e2 等
        this.refCounter = 0;

        this.options = {
            headless: options.headless !== false, // 預設無頭模式
            timeout: options.timeout || 30000,
            viewport: options.viewport || { width: 1280, height: 720 },
            debug: options.debug || false
        };
    }

    /**
     * 初始化瀏覽器
     */
    async init() {
        if (this.browser) return;

        if (this.options.debug) {
            tfd.sys('SemanticBrowser', '初始化瀏覽器...');
        }

        this.browser = await chromium.launch({
            headless: this.options.headless,
            timeout: this.options.timeout
        });

        this.context = await this.browser.newContext({
            viewport: this.options.viewport
        });

        this.page = await this.context.newPage();
        this.page.setDefaultTimeout(this.options.timeout);
    }

    /**
     * 開啟網頁
     */
    async open(url) {
        await this.init();

        if (this.options.debug) {
            tfd.sys('SemanticBrowser', `開啟: ${url}`);
        }

        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    }

    /**
     * 取得語義化快照（可訪問性樹）
     * @param {Object} options - 選項
     * @returns {Promise<string>} 快照文字
     */
    async snapshot(options = {}) {
        if (!this.page) throw new Error('未初始化瀏覽器');

        // 重置元素參考
        this.elementRefs.clear();
        this.refCounter = 0;

        // 取得可訪問性樹
        const accessibilitySnapshot = await this.page.accessibility.snapshot();

        // 轉換為類似 Agent Browser 的格式
        const lines = [];
        this._convertToLines(accessibilitySnapshot, lines, 0);

        return lines.join('\n');
    }

    /**
     * 遞迴轉換可訪問性樹為文字行
     * @private
     */
    _convertToLines(node, lines, indent) {
        if (!node) return;

        const { role, name, value, checked, disabled, children } = node;

        // 只顯示有意義的節點
        if (!role || role === 'generic') {
            if (children) {
                children.forEach(child => this._convertToLines(child, lines, indent));
            }
            return;
        }

        // 建立元素參考
        const ref = `e${++this.refCounter}`;
        this.elementRefs.set(`@${ref}`, { role, name, value });

        // 格式化輸出
        const indentStr = '  '.repeat(indent);
        let text = name || value || '';

        if (text.length > 50) {
            text = text.substring(0, 47) + '...';
        }

        const attributes = [];
        if (checked !== undefined) attributes.push(checked ? 'checked' : 'unchecked');
        if (disabled) attributes.push('disabled');

        const attrStr = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
        const line = `${indentStr}- ${role} "${text}" [ref=${ref}]${attrStr}`;

        lines.push(line);

        // 遞迴處理子節點
        if (children) {
            children.forEach(child => this._convertToLines(child, lines, indent + 1));
        }
    }

    /**
     * 點擊元素
     * @param {string} selector - 可以是元素參考 @e2 或一般選擇器
     */
    async click(selector) {
        if (!this.page) throw new Error('未初始化瀏覽器');

        if (selector.startsWith('@')) {
            // 使用元素參考
            const refData = this.elementRefs.get(selector);
            if (!refData) throw new Error(`找不到元素參考: ${selector}`);

            // 根據角色和名稱查找元素
            const element = await this._findElementByRef(refData);
            await element.click();
        } else {
            // 使用一般選擇器
            await this.page.click(selector);
        }
    }

    /**
     * 填寫輸入框
     */
    async fill(selector, value) {
        if (!this.page) throw new Error('未初始化瀏覽器');

        if (selector.startsWith('@')) {
            const refData = this.elementRefs.get(selector);
            if (!refData) throw new Error(`找不到元素參考: ${selector}`);

            const element = await this._findElementByRef(refData);
            await element.fill(value);
        } else {
            await this.page.fill(selector, value);
        }
    }

    /**
     * 根據元素參考資料查找元素
     * @private
     */
    async _findElementByRef(refData) {
        const { role, name } = refData;

        // 使用 getByRole 查找
        return this.page.getByRole(role, { name });
    }

    /**
     * 取得元素文字
     */
    async getText(selector) {
        if (!this.page) throw new Error('未初始化瀏覽器');

        if (selector.startsWith('@')) {
            const refData = this.elementRefs.get(selector);
            if (!refData) throw new Error(`找不到元素參考: ${selector}`);

            const element = await this._findElementByRef(refData);
            return await element.textContent();
        } else {
            return await this.page.textContent(selector);
        }
    }

    /**
     * 截圖
     */
    async screenshot(path, options = {}) {
        if (!this.page) throw new Error('未初始化瀏覽器');

        await this.page.screenshot({
            path,
            fullPage: options.fullPage || false
        });

        return path;
    }

    /**
     * 等待元素
     */
    async waitFor(selector, timeout) {
        if (!this.page) throw new Error('未初始化瀏覽器');

        if (selector.startsWith('@')) {
            const refData = this.elementRefs.get(selector);
            if (!refData) throw new Error(`找不到元素參考: ${selector}`);

            const element = await this._findElementByRef(refData);
            await element.waitFor({ timeout: timeout || this.options.timeout });
        } else {
            await this.page.waitForSelector(selector, { timeout: timeout || this.options.timeout });
        }
    }

    /**
     * 等待載入完成
     */
    async waitForLoad() {
        if (!this.page) throw new Error('未初始化瀏覽器');
        await this.page.waitForLoadState('domcontentloaded');
    }

    /**
     * 取得當前 URL
     */
    async getCurrentUrl() {
        if (!this.page) throw new Error('未初始化瀏覽器');
        return this.page.url();
    }

    /**
     * 取得 HTML
     */
    async getHtml(selector) {
        if (!this.page) throw new Error('未初始化瀏覽器');

        if (selector) {
            return await this.page.innerHTML(selector);
        } else {
            return await this.page.content();
        }
    }

    /**
     * Cookie 管理
     */
    async getCookies() {
        if (!this.context) throw new Error('未初始化瀏覽器');
        return await this.context.cookies();
    }

    async setCookie(name, value, options = {}) {
        if (!this.context) throw new Error('未初始化瀏覽器');
        await this.context.addCookies([{
            name,
            value,
            domain: options.domain || new URL(this.page.url()).hostname,
            path: options.path || '/'
        }]);
    }

    async clearCookies() {
        if (!this.context) throw new Error('未初始化瀏覽器');
        await this.context.clearCookies();
    }

    /**
     * 工作階段管理
     */
    async saveSession(filePath) {
        if (!this.context) throw new Error('未初始化瀏覽器');

        const cookies = await this.context.cookies();
        const localStorage = await this.page.evaluate(() => {
            return JSON.stringify(localStorage);
        });

        const fs = require('fs').promises;
        await fs.writeFile(filePath, JSON.stringify({
            cookies,
            localStorage: JSON.parse(localStorage),
            url: this.page.url()
        }, null, 2), 'utf-8');
    }

    async loadSession(filePath) {
        if (!this.context) throw new Error('未初始化瀏覽器');

        const fs = require('fs').promises;
const tfd = require('./tfd-logger');
        const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));

        // 恢復 Cookies
        if (data.cookies) {
            await this.context.addCookies(data.cookies);
        }

        // 恢復 localStorage（需要先導航到目標頁面）
        if (data.url && data.localStorage) {
            await this.page.goto(data.url);
            await this.page.evaluate((storageData) => {
                for (const [key, value] of Object.entries(storageData)) {
                    localStorage.setItem(key, value);
                }
            }, data.localStorage);
        }
    }

    /**
     * 滾動頁面
     */
    async scroll(direction, pixels) {
        if (!this.page) throw new Error('未初始化瀏覽器');

        const delta = pixels || 500;
        const scrollMap = {
            down: { x: 0, y: delta },
            up: { x: 0, y: -delta },
            right: { x: delta, y: 0 },
            left: { x: -delta, y: 0 }
        };

        const scroll = scrollMap[direction];
        if (!scroll) throw new Error(`不支援的滾動方向: ${direction}`);

        await this.page.mouse.wheel(scroll.x, scroll.y);
    }

    /**
     * 關閉瀏覽器
     */
    async close() {
        if (this.browser) {
            if (this.options.debug) {
                tfd.sys('SemanticBrowser', '關閉瀏覽器');
            }
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
        }
    }

    /**
     * 解析快照（輔助方法）
     */
    parseSnapshot(snapshot) {
        const lines = snapshot.split('\n');
        const elements = [];

        for (const line of lines) {
            const match = line.match(/^(\s*)- (\w+) "([^"]*)"\s+\[ref=(\w+)\](.*)$/);
            if (match) {
                const [, indent, role, text, ref, attributes] = match;
                elements.push({
                    indent: indent.length / 2,
                    role,
                    text,
                    ref: `@${ref}`,
                    disabled: attributes.includes('disabled'),
                    checked: attributes.includes('checked'),
                    raw: line
                });
            }
        }

        return elements;
    }

    /**
     * 查找元素（輔助方法）
     */
    findElement(snapshot, criteria) {
        const elements = this.parseSnapshot(snapshot);

        return elements.find(el => {
            if (criteria.role && el.role !== criteria.role) return false;
            if (criteria.text && !el.text.includes(criteria.text)) return false;
            if (criteria.ref && el.ref !== criteria.ref) return false;
            return true;
        });
    }
}

module.exports = PlaywrightSemanticBrowser;
