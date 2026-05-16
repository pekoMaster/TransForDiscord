const cheerio = require('cheerio');

class DOMParser {
    constructor() {
        this.defaultOptions = {
            decodeEntities: true,
            normalizeWhitespace: true
        };
    }

    parse(html, options = {}) {
        const parseOptions = { ...this.defaultOptions, ...options };
        return cheerio.load(html, parseOptions);
    }

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

    extractTitle($) {
        return this.getFirstValid($, [
            'meta[property="og:title"]',
            'meta[name="twitter:title"]',
            'meta[property="twitter:title"]',
            'title',
            'h1'
        ]);
    }

    extractDescription($) {
        return this.getFirstValid($, [
            'meta[property="og:description"]',
            'meta[name="twitter:description"]',
            'meta[property="twitter:description"]',
            'meta[name="description"]',
            'meta[property="description"]'
        ]);
    }

    extractImage($) {
        return this.getFirstValid($, [
            'meta[property="og:image"]',
            'meta[name="twitter:image"]',
            'meta[property="twitter:image"]',
            'meta[name="twitter:image:src"]',
            'link[rel="image_src"]'
        ]);
    }

    extractCanonicalURL($) {
        return this.getFirstValid($, [
            'meta[property="og:url"]',
            'link[rel="canonical"]',
            'meta[name="twitter:url"]'
        ]);
    }

    extractSiteName($) {
        return this.getFirstValid($, [
            'meta[property="og:site_name"]',
            'meta[name="application-name"]',
            'meta[name="apple-mobile-web-app-title"]'
        ]);
    }

    extractAuthor($) {
        return this.getFirstValid($, [
            'meta[name="author"]',
            'meta[property="article:author"]',
            'meta[name="twitter:creator"]',
            '.author',
            '.byline'
        ]);
    }

    extractPublishedTime($) {
        return this.getFirstValid($, [
            'meta[property="article:published_time"]',
            'meta[name="publish_date"]',
            'meta[name="date"]',
            'time[datetime]',
            'time'
        ]);
    }

    extractKeywords($) {
        return this.getFirstValid($, [
            'meta[name="keywords"]',
            'meta[property="article:tag"]'
        ]);
    }

    getFirstValid($, selectors) {
        for (const selector of selectors) {
            const element = $(selector).first();
            if (element.length === 0) continue;

            const content =
                element.attr('content') ||
                element.attr('href') ||
                element.attr('datetime') ||
                element.text().trim();

            if (content && content.length > 0) {
                return content;
            }
        }

        return '';
    }

    cleanMetadata(metadata) {
        const cleaned = {};

        for (const [key, value] of Object.entries(metadata)) {
            if (typeof value === 'string') {
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

    extractText(html, selector) {
        const $ = this.parse(html);
        return $(selector).text().trim();
    }

    extractAttribute(html, selector, attribute) {
        const $ = this.parse(html);
        return $(selector).attr(attribute) || '';
    }

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

    hasElement(html, selector) {
        const $ = this.parse(html);
        return $(selector).length > 0;
    }
}

module.exports = DOMParser;
