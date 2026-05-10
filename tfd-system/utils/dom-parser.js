/**
 * TFD 系統 - DOM 解析器
 * HTML 內容解析和資料提取
 */

const cheerio = require('cheerio');

class DOMParser {
    constructor() {
        this.defaultOptions = {
            decodeEntities: true,
            normalizeWhitespace: true
        };
    }

    /**
     * 解析 HTML 字串
     * @param {string} html
     * @param {Object} options
     * @returns {Object} Cheerio 物件
     */
    parse(html, options = {}) {
        const parseOptions = { ...this.defaultOptions, ...options };
        return cheerio.load(html, parseOptions);
    }

    /**
     * 提取基本元資料
     * @param {string} html
     * @returns {Object}
     */
    extractMetadata(html) {
        const $ = this.parse(html);

        const metadata = {
            title: this.extractTitle($),
            description: this.extractDescription($),
            image: this.extractImage($),
            url: this.extractCanonicalURL($),
            siteName: this.extractSiteName($),
            author: this.extractAuthor($),
            publishedTime: this.extractPublishedTime($),
            keywords: this.extractKeywords($)
        };

        return this.cleanMetadata(metadata);
    }

    /**
     * 提取標題
     * @param {Object} $
     * @returns {string}
     */
    extractTitle($) {
        return this.getFirstValid($, [
            'meta[property="og:title"]',
            'meta[name="twitter:title"]',
            'meta[property="twitter:title"]',
            'title',
            'h1'
        ]);
    }

    /**
     * 提取描述
     * @param {Object} $
     * @returns {string}
     */
    extractDescription($) {
        return this.getFirstValid($, [
            'meta[property="og:description"]',
            'meta[name="twitter:description"]',
            'meta[property="twitter:description"]',
            'meta[name="description"]',
            'meta[property="description"]'
        ]);
    }

    /**
     * 提取圖片
     * @param {Object} $
     * @returns {string}
     */
    extractImage($) {
        return this.getFirstValid($, [
            'meta[property="og:image"]',
            'meta[name="twitter:image"]',
            'meta[property="twitter:image"]',
            'meta[name="twitter:image:src"]',
            'link[rel="image_src"]'
        ]);
    }

    /**
     * 提取標準 URL
     * @param {Object} $
     * @returns {string}
     */
    extractCanonicalURL($) {
        return this.getFirstValid($, [
            'meta[property="og:url"]',
            'link[rel="canonical"]',
            'meta[name="twitter:url"]'
        ]);
    }

    /**
     * 提取網站名稱
     * @param {Object} $
     * @returns {string}
     */
    extractSiteName($) {
        return this.getFirstValid($, [
            'meta[property="og:site_name"]',
            'meta[name="application-name"]',
            'meta[name="apple-mobile-web-app-title"]'
        ]);
    }

    /**
     * 提取作者
     * @param {Object} $
     * @returns {string}
     */
    extractAuthor($) {
        return this.getFirstValid($, [
            'meta[name="author"]',
            'meta[property="article:author"]',
            'meta[name="twitter:creator"]',
            '.author',
            '.byline'
        ]);
    }

    /**
     * 提取發布時間
     * @param {Object} $
     * @returns {string}
     */
    extractPublishedTime($) {
        return this.getFirstValid($, [
            'meta[property="article:published_time"]',
            'meta[name="publish_date"]',
            'meta[name="date"]',
            'time[datetime]',
            'time'
        ]);
    }

    /**
     * 提取關鍵字
     * @param {Object} $
     * @returns {string}
     */
    extractKeywords($) {
        return this.getFirstValid($, [
            'meta[name="keywords"]',
            'meta[property="article:tag"]'
        ]);
    }

    /**
     * 取得第一個有效值
     * @param {Object} $
     * @param {string[]} selectors
     * @returns {string}
     */
    getFirstValid($, selectors) {
        for (const selector of selectors) {
            const element = $(selector).first();

            if (element.length > 0) {
                // 根據元素類型取得內容
                const content = element.attr('content') ||
                               element.attr('href') ||
                               element.attr('datetime') ||
                               element.text().trim();

                if (content && content.length > 0) {
                    return content;
                }
            }
        }

        return '';
    }

    /**
     * 清理和標準化元資料
     * @param {Object} metadata
     * @returns {Object}
     */
    cleanMetadata(metadata) {
        const cleaned = {};

        for (const [key, value] of Object.entries(metadata)) {
            if (typeof value === 'string') {
                // 移除多餘空白和換行
                const cleanValue = value.replace(/\s+/g, ' ').trim();

                if (cleanValue.length > 0) {
                    cleaned[key] = cleanValue;
                }
            } else {
                cleaned[key] = value;
            }
        }

        return cleaned;
    }

    /**
     * 提取特定選擇器的文字內容
     * @param {string} html
     * @param {string} selector
     * @returns {string}
     */
    extractText(html, selector) {
        const $ = this.parse(html);
        return $(selector).text().trim();
    }

    /**
     * 提取特定選擇器的屬性值
     * @param {string} html
     * @param {string} selector
     * @param {string} attribute
     * @returns {string}
     */
    extractAttribute(html, selector, attribute) {
        const $ = this.parse(html);
        return $(selector).attr(attribute) || '';
    }

    /**
     * 提取多個元素的內容
     * @param {string} html
     * @param {string} selector
     * @returns {string[]}
     */
    extractMultiple(html, selector) {
        const $ = this.parse(html);
        const results = [];

        $(selector).each((index, element) => {
            const text = $(element).text().trim();
            if (text) {
                results.push(text);
            }
        });

        return results;
    }

    /**
     * 檢查元素是否存在
     * @param {string} html
     * @param {string} selector
     * @returns {boolean}
     */
    hasElement(html, selector) {
        const $ = this.parse(html);
        return $(selector).length > 0;
    }
}

module.exports = DOMParser;