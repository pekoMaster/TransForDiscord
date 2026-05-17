/**
 * TFD 系統 - 4Gamers 提取器
 * 支援短網址 (4gamers.com.tw/x/{code}) 和一般新聞網址
 * 提取標題、遊戲標籤、作者、日期、內文和圖片
 */

const { EmbedBuilder } = require('discord.js');
const HTTPClient = require('../../../shared/http/http-client');
const URLConverterLogger = require('../../../shared/logging/url-converter-logger');
const tfd = require('../../../shared/logging/tfd-logger');

class TFD4GamersExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.name = '4Gamers';
        this.iconURL = 'https://img.4gamers.com.tw/websites-banner/puku-social-logo-url-20180907.png';
        this.apiBase = 'https://www.4gamers.com.tw';
    }

    /**
     * 處理 4Gamers URL
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { extractedData, originalURL } = matchResult;
        const { shortCode, newsId } = extractedData;

        try {
            let newsIdToUse = newsId;

            // 如果是短網址，先轉換成新聞 ID
            if (shortCode) {
                tfd.sys('4Gamers', `解析短網址: ${shortCode}`);
                newsIdToUse = await this.resolveShortUrl(shortCode);
            }

            if (!newsIdToUse) {
                throw new Error('無法解析文章 ID');
            }

            tfd.sys('4Gamers', `獲取文章: ${newsIdToUse}`);

            // 使用 Puppeteer 獲取頁面內容 (因為 4Gamers 是 SPA)
            const articleData = await this.fetchArticleWithPuppeteer(originalURL, newsIdToUse);

            if (!articleData.title) {
                throw new Error('無法解析文章資料');
            }

            tfd.sys('4Gamers', `成功獲取文章: ${articleData.title}`);

            // 建立 Embed
            const embed = this.buildArticleEmbed(articleData, originalURL);

            // 記錄網址轉換
            URLConverterLogger.logConversion('4gamers', message, `文章: ${articleData.title}`);

            return {
                success: true,
                embed: embed,
                siteName: '4gamers',
                contentType: 'article',
                articleData: articleData,
                multipleImages: articleData.images && articleData.images.length >= 2 && articleData.images.length <= 4
                    ? articleData.images
                    : null
            };

        } catch (error) {
            tfd.sysError('4Gamers', `處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 解析短網址，取得新聞 ID
     * @param {string} shortCode - 短網址代碼
     * @returns {Promise<string>} 新聞 ID
     */
    async resolveShortUrl(shortCode) {
        try {
            const url = `${this.apiBase}/site/api/shorten/find/${shortCode}`;
            const response = await this.httpClient.fetchJSON(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (response?.data?.url) {
                // 從 URL 中提取新聞 ID
                // 格式: https://www.4gamers.com.tw/news/detail/78380/...
                const match = response.data.url.match(/\/detail\/(\d+)\//);
                if (match) {
                    return match[1];
                }
            }

            return null;
        } catch (error) {
            tfd.sysError('4Gamers', `短網址解析失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * 獲取文章資料（快速模式 - 直接使用 HTTP 請求）
     * @param {string} url - 文章 URL
     * @param {string} newsId - 新聞 ID
     * @returns {Promise<Object>} 文章資料
     */
    async fetchArticleWithPuppeteer(url, newsId) {
        try {
            // 直接使用 HTTP 請求獲取 HTML（4Gamers 的 Open Graph 在初始 HTML 中就有）
            const html = await this.httpClient.fetchHTML(url, {
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            return this.parseArticleFromHtml(html, url, newsId);

        } catch (error) {
            tfd.sysError('4Gamers', `HTTP 請求失敗: ${error.message}`);
            // 如果 HTTP 失敗，返回空資料讓调用者處理
            return this.parseArticleFromHtml('', url, newsId);
        }
    }

    /**
     * 從 HTML 解析文章資料
     * @param {string} html - HTML 內容
     * @param {string} url - 文章 URL
     * @param {string} newsId - 新聞 ID
     * @returns {Object} 文章資料
     */
    parseArticleFromHtml(html, url, newsId) {
        const data = {
            title: null,
            tags: [],
            author: null,
            date: null,
            content: null,
            images: [],
            url: url || `${this.apiBase}/news/detail/${newsId}/`
        };

        // 解析 Open Graph
        const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (ogTitleMatch) {
            data.title = this.decodeHtmlEntities(ogTitleMatch[1]);
        }

        const ogDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
        if (ogDescMatch) {
            data.content = this.decodeHtmlEntities(ogDescMatch[1]);
        }

        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (ogImageMatch) {
            data.images.push(ogImageMatch[1]);
        }

        // 解析 JSON-LD
        const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
        if (jsonLdMatch) {
            try {
                const jsonLd = JSON.parse(jsonLdMatch[1]);
                const articleData = Array.isArray(jsonLd)
                    ? jsonLd.find(item => item['@type'] === 'NewsArticle')
                    : jsonLd;

                if (articleData) {
                    if (!data.title && articleData.headline) {
                        data.title = articleData.headline;
                    }
                    if (articleData.author) {
                        data.author = typeof articleData.author === 'string'
                            ? articleData.author
                            : articleData.author.name;
                    }
                    if (articleData.datePublished) {
                        try {
                            const date = new Date(articleData.datePublished);
                            data.date = date.toLocaleDateString('zh-TW', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                timeZone: 'Asia/Taipei'
                            });
                        } catch (e) {
                            data.date = articleData.datePublished;
                        }
                    }
                    if (articleData.keywords) {
                        data.tags = typeof articleData.keywords === 'string'
                            ? articleData.keywords.split(',').map(k => k.trim())
                            : articleData.keywords;
                    }
                }
            } catch (e) {
                tfd.sysError('4Gamers', `JSON-LD 解析錯誤: ${e.message}`);
            }
        }

        // 提取內文 (從 <p> 標籤)
        if (!data.content || data.content.length < 100) {
            const paragraphs = [];
            const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            let match;

            while ((match = pRegex.exec(html)) !== null && paragraphs.length < 3) {
                let text = match[1]
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (text.length > 30 && !text.includes('廣告') && !text.includes('推薦')) {
                    paragraphs.push(text);
                }
            }

            if (paragraphs.length > 0) {
                data.content = paragraphs.join('\n\n');
            }
        }

        // 提取更多圖片
        const imageMatches = html.match(/https:\/\/thumbor\.4gamers\.com\.tw\/[^\s"']+/gi) || [];
        imageMatches.forEach(imgUrl => {
            if (!data.images.includes(imgUrl)) {
                data.images.push(imgUrl);
            }
        });

        return data;
    }

    /**
     * 解碼 HTML 實體
     * @param {string} text
     * @returns {string}
     */
    decodeHtmlEntities(text) {
        if (!text) return text;
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&hellip;/g, '...')
            .replace(/&mdash;/g, '—')
            .replace(/&ndash;/g, '–');
    }

    /**
     * 標準化文章資料
     * @param {Object} rawData - 原始資料
     * @returns {Object} 標準化資料
     */
    normalizeArticleData(rawData) {
        const data = {
            title: rawData.title || rawData.headline || null,
            tags: [],
            author: null,
            date: null,
            content: null,
            images: [],
            url: rawData.url || null
        };

        // 提取標籤/遊戲資訊
        if (rawData.tags && Array.isArray(rawData.tags)) {
            data.tags = rawData.tags.map(tag => tag.name || tag).filter(Boolean);
        } else if (rawData.categories && Array.isArray(rawData.categories)) {
            data.tags = rawData.categories.map(cat => cat.name || cat).filter(Boolean);
        }

        // 提取作者
        if (rawData.author) {
            if (typeof rawData.author === 'string') {
                data.author = rawData.author;
            } else if (rawData.author.name) {
                data.author = rawData.author.name;
            } else if (Array.isArray(rawData.author)) {
                data.author = rawData.author.map(a => a.name || a).join('、');
            }
        } else if (rawData.writer || rawData.credits) {
            data.author = rawData.writer || rawData.credits;
        }

        // 提取日期
        if (rawData.publishedAt || rawData.publishDate || rawData.datePublished) {
            const dateStr = rawData.publishedAt || rawData.publishDate || rawData.datePublished;
            try {
                const date = new Date(dateStr);
                data.date = date.toLocaleDateString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    timeZone: 'Asia/Taipei'
                });
            } catch (e) {
                data.date = dateStr;
            }
        }

        // 提取內文
        if (rawData.content || rawData.description || rawData.summary) {
            let content = rawData.content || rawData.description || rawData.summary;
            if (content.length > 1000) {
                content = content.substring(0, 997) + '...';
            }
            data.content = content;
        }

        // 提取圖片
        if (rawData.images && Array.isArray(rawData.images)) {
            data.images = rawData.images.map(img => {
                if (typeof img === 'string') return img;
                return img.url || img.src || img.desktop || null;
            }).filter(Boolean);
        } else if (rawData.image) {
            if (typeof rawData.image === 'string') {
                data.images.push(rawData.image);
            } else if (rawData.image.url) {
                data.images.push(rawData.image.url);
            }
        }

        return data;
    }

    /**
     * 建立文章 Embed
     * @param {Object} articleData - 文章資料
     * @param {string} originalURL - 原始 URL
     * @returns {EmbedBuilder}
     */
    buildArticleEmbed(articleData, originalURL) {
        const embed = new EmbedBuilder();
        embed.setColor(0xFF6600); // 4Gamers 橘色系

        // 設定 Author (顯示遊戲標籤和作者)
        const authorParts = [];
        if (articleData.tags && articleData.tags.length > 0) {
            authorParts.push(articleData.tags.join('、'));
        }
        if (articleData.author) {
            authorParts.push(articleData.author);
        }

        if (authorParts.length > 0) {
            embed.setAuthor({
                name: authorParts.join(' | '),
                iconURL: this.iconURL,
                url: this.apiBase
            });
        } else {
            embed.setAuthor({
                name: this.name,
                iconURL: this.iconURL,
                url: this.apiBase
            });
        }

        // 設定標題
        if (articleData.title) {
            let title = articleData.title;
            if (title.length > 250) {
                title = title.substring(0, 247) + '...';
            }
            embed.setTitle(title);
            embed.setURL(originalURL);
        }

        // 設定描述 (內文摘要)
        if (articleData.content) {
            let desc = articleData.content;
            if (desc.length > 500) {
                desc = desc.substring(0, 497) + '...';
            }
            embed.setDescription(desc);
        }

        // 設定圖片 (如果有圖片)
        if (articleData.images && articleData.images.length > 0) {
            embed.setImage(articleData.images[0]);
        }

        // 添加額外資訊欄位
        const fields = [];

        // 作者
        if (articleData.author) {
            fields.push({
                name: '作者',
                value: articleData.author,
                inline: true
            });
        }

        // 文章日期
        if (articleData.date) {
            fields.push({
                name: '發布日期',
                value: articleData.date,
                inline: true
            });
        }

        // 遊戲標籤
        if (articleData.tags && articleData.tags.length > 0) {
            fields.push({
                name: '遊戲/標籤',
                value: articleData.tags.map(tag => `\`${tag}\``).join(' '),
                inline: false
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // 設定 Footer
        embed.setFooter({
            text: '4Gamers | Peko Embed',
            iconURL: this.iconURL
        });

        // 設定時間戳 (如果有日期)
        if (articleData.date) {
            try {
                embed.setTimestamp(new Date(articleData.date));
            } catch (e) {
                embed.setTimestamp();
            }
        } else {
            embed.setTimestamp();
        }

        return embed;
    }

    /**
     * 創建錯誤響應
     */
    createErrorResponse(errorMessage, originalURL) {
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('4Gamers 文章提取失敗')
            .setDescription(`錯誤: ${errorMessage}`)
            .setURL(originalURL)
            .setFooter({
                text: 'Peko Embed',
                iconURL: this.iconURL
            })
            .setTimestamp();

        return {
            success: false,
            error: errorMessage,
            embed: errorEmbed,
            siteName: '4gamers',
            contentType: 'error'
        };
    }
}

module.exports = TFD4GamersExtractor;
