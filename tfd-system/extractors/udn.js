/**
 * TFD 系統 - UDN 聯合新聞網提取器
 * 提取 UDN 新聞文章資訊並生成 Embed
 */

const { EmbedBuilder } = require('discord.js');
const HTTPClient = require('../../src/shared/http/http-client');
const URLConverterLogger = require('../utils/url-converter-logger');
const tfd = require('../../utils/tfd-logger');

class TFDUDNExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.name = 'UDN 聯合新聞網';
        this.iconURL = 'https://udn.com/static/img/logo.svg?2020020601';
    }

    /**
     * 處理 UDN URL
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { extractedData, originalURL } = matchResult;
        const { storyId, articleId } = extractedData;

        try {
            tfd.sys('UDN', `獲取文章: story/${storyId}/${articleId}`);

            // 獲取頁面 HTML
            const html = await this.httpClient.fetchHTML(originalURL, {
                timeout: 15000,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!html || typeof html !== 'string' || html.length < 100) {
                throw new Error('無法獲取頁面內容或頁面內容無效');
            }

            // 優先解析 JSON-LD 結構化資料
            let articleData = this.parseJsonLdData(html);

            // 如果 JSON-LD 解析失敗，嘗試 Open Graph
            if (!articleData.title) {
                articleData = { ...articleData, ...this.parseOpenGraphData(html) };
            }

            // 解析內文摘要
            const contentSummary = this.parseContentSummary(html);
            if (contentSummary) {
                articleData.contentSummary = contentSummary;
            }

            if (!articleData.title) {
                throw new Error('無法解析文章資料');
            }

            tfd.sys('UDN', `成功獲取文章: ${articleData.title}`);

            // 建立 Embed
            const embed = this.buildArticleEmbed(articleData, originalURL);

            // 記錄網址轉換
            URLConverterLogger.logConversion('udn', message, `文章: ${articleData.title}`);

            return {
                success: true,
                embed: embed,
                siteName: 'udn',
                contentType: 'article',
                articleData: articleData
            };

        } catch (error) {
            tfd.sysError('UDN', `處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 解析 JSON-LD 結構化資料
     * @param {string} html - 頁面 HTML
     * @returns {Object} 文章資料
     */
    parseJsonLdData(html) {
        const data = {};

        try {
            // 找到 JSON-LD script 標籤
            const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
            if (jsonLdMatch) {
                const jsonLdContent = jsonLdMatch[1].trim();
                const jsonLd = JSON.parse(jsonLdContent);

                // 處理可能是陣列的情況
                const articleData = Array.isArray(jsonLd)
                    ? jsonLd.find(item => item['@type'] === 'NewsArticle' || item['@type'] === 'Article')
                    : jsonLd;

                if (articleData) {
                    // 標題
                    if (articleData.headline) {
                        data.title = articleData.headline;
                    }

                    // 描述
                    if (articleData.description) {
                        data.description = articleData.description;
                    }

                    // 發布日期
                    if (articleData.datePublished) {
                        data.datePublished = articleData.datePublished;
                    }

                    // 修改日期
                    if (articleData.dateModified) {
                        data.dateModified = articleData.dateModified;
                    }

                    // 作者
                    if (articleData.author) {
                        if (typeof articleData.author === 'string') {
                            data.author = this.stripHtmlTags(articleData.author);
                        } else if (articleData.author.name) {
                            data.author = this.stripHtmlTags(articleData.author.name);
                        } else if (Array.isArray(articleData.author)) {
                            data.author = articleData.author
                                .map(a => this.stripHtmlTags(a.name || a))
                                .join('、');
                        }
                    }

                    // 圖片
                    if (articleData.image) {
                        if (typeof articleData.image === 'string') {
                            data.image = articleData.image;
                        } else if (articleData.image.url) {
                            data.image = articleData.image.url;
                        } else if (Array.isArray(articleData.image) && articleData.image[0]) {
                            data.image = typeof articleData.image[0] === 'string'
                                ? articleData.image[0]
                                : articleData.image[0].url;
                        }
                    }

                    // 出版者
                    if (articleData.publisher?.name) {
                        data.publisher = articleData.publisher.name;
                    }

                    // 關鍵字
                    if (articleData.keywords) {
                        if (typeof articleData.keywords === 'string') {
                            data.keywords = articleData.keywords.split(',').map(k => k.trim());
                        } else if (Array.isArray(articleData.keywords)) {
                            data.keywords = articleData.keywords;
                        }
                    }
                }
            }
        } catch (e) {
            tfd.sysError('UDN', `JSON-LD 解析錯誤: ${e.message}`);
        }

        return data;
    }

    /**
     * 解析 Open Graph Meta Tags (備用)
     * @param {string} html - 頁面 HTML
     * @returns {Object} 文章資料
     */
    parseOpenGraphData(html) {
        const data = {};

        // 提取標題
        const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (ogTitleMatch) {
            data.title = this.decodeHtmlEntities(ogTitleMatch[1]);
        }

        // 提取描述
        const ogDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
        if (ogDescMatch) {
            // UDN description 可能含有 <a href> 等 HTML 標籤，需先剝離再解碼
            data.description = this.stripHtmlTags(this.decodeHtmlEntities(ogDescMatch[1]));
        }

        // 提取圖片
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (ogImageMatch) {
            data.image = ogImageMatch[1];
        }

        // 提取網站名稱
        const ogSiteMatch = html.match(/<meta property="og:site_name" content="([^"]+)"/i);
        if (ogSiteMatch) {
            data.publisher = ogSiteMatch[1];
        }

        return data;
    }

    /**
     * 解析內文摘要
     * @param {string} html - 頁面 HTML
     * @returns {string|null} 內文摘要
     */
    parseContentSummary(html) {
        try {
            // 方法 1: 直接提取文章段落 <p> 標籤內容
            // UDN 的內文段落在 article-content 區域內的 <p> 標籤
            const paragraphs = [];

            // 匹配所有 <p> 標籤（排除空的和只有空白的）
            const pTagRegex = /<p[^>]*>([^<]+(?:<(?!\/p>)[^<]*)*)<\/p>/gi;
            let match;

            while ((match = pTagRegex.exec(html)) !== null) {
                let text = match[1]
                    .replace(/<[^>]+>/g, '') // 移除內部 HTML 標籤
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                // 過濾掉太短的、廣告相關的、或是 "聽新聞" 等干擾內容
                if (text.length > 20 &&
                    !text.includes('聽新聞') &&
                    !text.includes('廣告') &&
                    !text.includes('推薦') &&
                    !text.includes('延伸閱讀') &&
                    !text.includes('看更多') &&
                    !text.includes('訂閱') &&
                    !text.includes('加入會員')) {
                    paragraphs.push(text);
                }
            }

            // 如果找到段落，組合前幾段
            if (paragraphs.length > 0) {
                let summary = paragraphs.slice(0, 3).join('\n\n');
                if (summary.length > 500) {
                    summary = summary.substring(0, 497) + '...';
                }
                return summary;
            }

            // 方法 2: 從 article-content__paragraph 提取
            const paragraphMatch = html.match(/<section[^>]*class="[^"]*article-content__paragraph[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
            if (paragraphMatch) {
                let text = paragraphMatch[1]
                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<figure[\s\S]*?<\/figure>/gi, '') // 移除圖片區塊
                    .replace(/<aside[\s\S]*?<\/aside>/gi, '') // 移除側邊欄
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                // 過濾干擾內容
                text = text.replace(/聽新聞.*?(?=\S{10}|$)/g, '').trim();

                if (text.length > 500) {
                    text = text.substring(0, 497) + '...';
                }

                if (text.length > 30) {
                    return text;
                }
            }

            // 方法 3: 備用 - 從 meta description 取得
            const metaDescMatch = html.match(/<meta name="description" content="([^"]+)"/i);
            if (metaDescMatch) {
                return this.decodeHtmlEntities(metaDescMatch[1]);
            }
        } catch (e) {
            tfd.sysError('UDN', `內文摘要解析錯誤: ${e.message}`);
        }

        return null;
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
     * 移除 HTML 標籤，只保留純文字
     * UDN 的 og:description / author 欄位可能內含 <a href> 等 HTML
     * @param {string} text
     * @returns {string}
     */
    stripHtmlTags(text) {
        if (!text) return text;
        return text
            .replace(/<[^>]+>/g, '')  // 移除所有 HTML 標籤
            .replace(/\s+/g, ' ')     // 合併多餘空白
            .trim();
    }

    /**
     * 格式化日期
     * @param {string} dateStr - ISO 日期字串
     * @returns {string} 格式化後的日期
     */
    formatDate(dateStr) {
        if (!dateStr) return null;
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Taipei'
            });
        } catch (e) {
            return dateStr;
        }
    }

    /**
     * 建立文章 Embed
     * @param {Object} articleData - 文章資料
     * @param {string} originalURL - 原始 URL
     * @returns {EmbedBuilder}
     */
    buildArticleEmbed(articleData, originalURL) {
        const embed = new EmbedBuilder();
        embed.setColor(0x003366); // UDN 深藍色

        // 設定 Author: 顯示出版者和作者（防護性剝除殘留 HTML）
        const authorParts = [];
        if (articleData.publisher) {
            authorParts.push(this.stripHtmlTags(articleData.publisher));
        }
        if (articleData.author) {
            authorParts.push(this.stripHtmlTags(articleData.author));
        }

        if (authorParts.length > 0) {
            embed.setAuthor({
                name: authorParts.join(' / '),
                iconURL: this.iconURL,
                url: 'https://udn.com'
            });
        } else {
            embed.setAuthor({
                name: this.name,
                iconURL: this.iconURL,
                url: 'https://udn.com'
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

        // 設定描述 (使用內文摘要或 description，防護性剝除殘留 HTML)
        const description = articleData.contentSummary || articleData.description;
        if (description) {
            let desc = this.stripHtmlTags(description);
            if (desc.length > 500) {
                desc = desc.substring(0, 497) + '...';
            }
            embed.setDescription(desc);
        }

        // 設定圖片
        if (articleData.image) {
            embed.setImage(articleData.image);
        }

        // 添加額外資訊欄位
        const fields = [];

        // 發布日期
        if (articleData.datePublished) {
            fields.push({
                name: '發布時間',
                value: this.formatDate(articleData.datePublished),
                inline: true
            });
        }

        // 關鍵字
        if (articleData.keywords && articleData.keywords.length > 0) {
            const keywords = articleData.keywords.slice(0, 5).map(k => `#${k}`).join(' ');
            fields.push({
                name: '關鍵字',
                value: keywords,
                inline: true
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // 設定 Footer
        embed.setFooter({
            text: 'UDN 聯合新聞網 | Peko Embed',
            iconURL: this.iconURL
        });

        // 設定時間戳
        if (articleData.datePublished) {
            try {
                embed.setTimestamp(new Date(articleData.datePublished));
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
            .setTitle('UDN 文章提取失敗')
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
            siteName: 'udn',
            contentType: 'error'
        };
    }
}

module.exports = TFDUDNExtractor;
