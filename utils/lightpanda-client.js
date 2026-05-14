/**
 * Lightpanda CDP 客戶端
 * 透過 Docker 執行的 Lightpanda 輕量 headless 瀏覽器進行網頁抓取
 *
 * 使用方式：
 *   docker-compose up -d lightpanda
 *   (預設 CDP 端點: ws://127.0.0.1:9222)
 *
 * 環境變數：
 *   LIGHTPANDA_HOST (預設: 127.0.0.1)
 *   LIGHTPANDA_PORT (預設: 9222)
 */

const puppeteer = require('puppeteer');
const tfd = require('./tfd-logger');

const CDP_HOST = process.env.LIGHTPANDA_HOST || '127.0.0.1';
const CDP_PORT = process.env.LIGHTPANDA_PORT || '9222';
const CDP_ENDPOINT = `ws://${CDP_HOST}:${CDP_PORT}`;

// 連線狀態
let _browser = null;
let _connectingPromise = null;
let _lastFailTime = 0;
const FAIL_COOLDOWN_MS = 60000; // 連線失敗後 60 秒才重試

/**
 * 建立 CDP 連線
 */
async function _connect() {
    const browser = await puppeteer.connect({
        browserWSEndpoint: CDP_ENDPOINT,
        defaultViewport: { width: 1280, height: 720 }
    });

    browser.on('disconnected', () => {
        _browser = null;
        tfd.sys('Lightpanda', 'CDP 連線中斷');
    });

    tfd.sys('Lightpanda', `已連接: ${CDP_ENDPOINT}`);
    return browser;
}

/**
 * 取得 Browser 實例（自動管理連線與重連）
 * @returns {Promise<Browser>}
 */
async function getBrowser() {
    // 已連線且有效
    if (_browser) {
        try {
            await _browser.version();
            return _browser;
        } catch {
            _browser = null;
        }
    }

    // 失敗冷卻中
    if (Date.now() - _lastFailTime < FAIL_COOLDOWN_MS) {
        throw new Error(`Lightpanda 暫時不可用（冷卻中）`);
    }

    // 防止並發建立多個連線
    if (_connectingPromise) {
        return _connectingPromise;
    }

    _connectingPromise = _connect()
        .then(browser => {
            _browser = browser;
            _connectingPromise = null;
            return browser;
        })
        .catch(error => {
            _lastFailTime = Date.now();
            _connectingPromise = null;
            throw new Error(`無法連接 Lightpanda (${CDP_ENDPOINT}): ${error.message}`);
        });

    return _connectingPromise;
}

/**
 * 非同步檢查 Lightpanda 是否可用
 * 不拋出錯誤，回傳 boolean
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
    if (Date.now() - _lastFailTime < FAIL_COOLDOWN_MS) return false;
    try {
        await getBrowser();
        return true;
    } catch {
        return false;
    }
}

/**
 * 抓取頁面的 OG meta 資訊
 * 適用於 SSR 或 JS 渲染後含 OG tags 的頁面
 *
 * @param {string} url - 目標 URL
 * @param {Object} options
 * @param {number}   options.timeout       - 頁面載入超時（ms，預設 15000）
 * @param {string}   options.waitSelector  - 等待此 CSS selector 出現後再擷取（選填）
 * @param {number}   options.extraWaitMs   - 額外等待時間（ms，預設 800）
 * @returns {Promise<{
 *   success: boolean,
 *   title?: string,
 *   description?: string,
 *   image?: string,
 *   siteName?: string,
 *   canonicalUrl?: string,
 *   error?: string
 * }>}
 */
async function fetchPageMeta(url, options = {}) {
    const {
        timeout = 15000,
        waitSelector = null,
        extraWaitMs = 800
    } = options;

    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

        // 等待特定元素（可選）
        if (waitSelector) {
            await page.waitForSelector(waitSelector, { timeout: 8000 }).catch(() => {});
        }

        // 額外等待 JS 渲染
        if (extraWaitMs > 0) {
            await new Promise(r => setTimeout(r, extraWaitMs));
        }

        // 從頁面擷取 OG meta
        const meta = await page.evaluate(() => {
            const get = (selector) => {
                const el = document.querySelector(selector);
                return el ? (el.getAttribute('content') || null) : null;
            };
            return {
                title: get('meta[property="og:title"]') || document.title || null,
                description: get('meta[property="og:description"]') || get('meta[name="description"]') || null,
                image: get('meta[property="og:image"]') || null,
                siteName: get('meta[property="og:site_name"]') || null,
                canonicalUrl: get('meta[property="og:url"]') || window.location.href
            };
        });

        return { success: true, ...meta };

    } catch (error) {
        tfd.sysError('Lightpanda', `fetchPageMeta 失敗 (${url}): ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        await page.close().catch(() => {});
    }
}

/**
 * 抓取頁面並執行自訂的 DOM 提取函數
 * 適用於需要深度解析的網站
 *
 * @param {string} url - 目標 URL
 * @param {Function} extractFn - 在 page.evaluate() 中執行的函數，回傳想要的資料
 * @param {Object} options - 同 fetchPageMeta 的 options
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function fetchPageWithExtractor(url, extractFn, options = {}) {
    const {
        timeout = 15000,
        waitSelector = null,
        extraWaitMs = 800
    } = options;

    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

        if (waitSelector) {
            await page.waitForSelector(waitSelector, { timeout: 8000 }).catch(() => {});
        }

        if (extraWaitMs > 0) {
            await new Promise(r => setTimeout(r, extraWaitMs));
        }

        const data = await page.evaluate(extractFn);
        return { success: true, data };

    } catch (error) {
        tfd.sysError('Lightpanda', `fetchPageWithExtractor 失敗 (${url}): ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        await page.close().catch(() => {});
    }
}

module.exports = {
    getBrowser,
    isAvailable,
    fetchPageMeta,
    fetchPageWithExtractor
};
