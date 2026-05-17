/**
 * TFD 系統 - XFastest 最速科技提取器
 * 提取 XFastest 新聞文章資訊並生成 Embed
 */

const { EmbedBuilder } = require('discord.js');
const HTTPClient = require('../../../shared/http/http-client');
const URLConverterLogger = require('../../../shared/logging/url-converter-logger');
const tfd = require('../../../shared/logging/tfd-logger');

class TFDXFastestExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.name = 'XFastest 最速科技';
        this.iconURL = 'https://news.xfastest.com/wp-content/uploads/2020/07/cropped-xfastest-icon-32x32.png';
    }

    /**
     * 處理 XFastest URL
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { originalURL } = matchResult;

        try {
            tfd.sys('XFastest', `獲取文章: ${originalURL}`);

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

            // XFastest 無 JSON-LD，直接從 Open Graph 和 HTML 解析
            const articleData = this.parseOpenGraphData(html);

            // 解析作者資訊
            const authorInfo = this.parseAuthorInfo(html);
            if (authorInfo) {
                articleData.authorName = authorInfo.name;
                articleData.authorAvatar = authorInfo.avatar;
                articleData.authorURL = authorInfo.url;
            }

            // 解析內文摘要
            const contentSummary = this.parseContentSummary(html);
            if (contentSummary) {
                articleData.contentSummary = contentSummary;
            }

            // 解析標籤
            const tags = this.parseTags(html);
            if (tags.length > 0) {
                articleData.tags = tags;
            }

            // 解析發布時間
            const publishedTime = this.parsePublishedTime(html);
            if (publishedTime) {
                articleData.datePublished = publishedTime;
            }

            // 解析瀏覽次數
            const views = this.parseViews(html);
            if (views) {
                articleData.views = views;
            }

            if (!articleData.title) {
                throw new Error('無法解析文章資料');
            }

            tfd.sys('XFastest', `成功獲取文章: ${articleData.title}`);

            const embed = this.buildArticleEmbed(articleData, originalURL);

            URLConverterLogger.logConversion('xfastest', message, `文章: ${articleData.title}`);

            return {
                success: true,
                embed: embed,
                siteName: 'xfastest',
                contentType: 'article',
                articleData: articleData
            };

        } catch (error) {
            tfd.sysError('XFastest', `處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 解析 Open Graph Meta Tags
     * @param {string} html
     * @returns {Object}
     */
    parseOpenGraphData(html) {
        const data = {};

        const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (ogTitleMatch) {
            data.title = this.decodeHtmlEntities(ogTitleMatch[1]);
        }

        const ogDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
        if (ogDescMatch) {
            data.description = this.decodeHtmlEntities(ogDescMatch[1]);
        }

        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (ogImageMatch) {
            data.image = ogImageMatch[1];
        }

        const ogSiteMatch = html.match(/<meta property="og:site_name" content="([^"]+)"/i);
        if (ogSiteMatch) {
            data.publisher = ogSiteMatch[1];
        }

        // 備用：從 <title> 取得標題
        if (!data.title) {
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
                // 移除 " | XFastest News" 後綴
                data.title = this.decodeHtmlEntities(titleMatch[1].replace(/\s*\|\s*XFastest\s*News\s*$/i, '').trim());
            }
        }

        return data;
    }

    /**
     * 解析作者資訊
     * @param {string} html
     * @returns {Object|null} { name, avatar, url }
     */
    parseAuthorInfo(html) {
        try {
            // 作者區域在 vw-post-meta 內，包含 avatar img 和作者名稱連結
            // 頭像格式: <img ... alt='sinchen' src='..._avatar_...-25x25.jpg' srcset='...-50x50.jpg 2x' ...>
            const avatarMatch = html.match(/<img[^>]*src=['"]([^'"]*_avatar_[^'"]*?)['"][^>]*alt=['"]([^'"]+)['"][^>]*>/i)
                || html.match(/<img[^>]*alt=['"]([^'"]+)['"][^>]*src=['"]([^'"]*_avatar_[^'"]*?)['"][^>]*>/i);

            let name = null;
            let avatar = null;
            let url = null;

            if (avatarMatch) {
                // 第一個 regex: src 在 alt 前面
                if (avatarMatch[1].includes('_avatar_')) {
                    avatar = avatarMatch[1];
                    name = avatarMatch[2];
                } else {
                    // 第二個 regex: alt 在 src 前面
                    name = avatarMatch[1];
                    avatar = avatarMatch[2];
                }

                // 嘗試從 srcset 取得較大的頭像
                const srcsetMatch = html.match(new RegExp(`srcset=['"]([^'"]*${name}_avatar_[^'"]*?)['"]`, 'i'));
                if (srcsetMatch) {
                    // srcset 格式: "url 2x"，取 URL 部分
                    const srcsetUrl = srcsetMatch[1].split(/\s+/)[0];
                    if (srcsetUrl) {
                        avatar = srcsetUrl;
                    }
                }
            }

            // 作者連結
            if (name) {
                const authorLinkMatch = html.match(new RegExp(`<a[^>]*href=['"]([^'"]*\\/author\\/${name}\\/?)['"]+[^>]*>`, 'i'));
                if (authorLinkMatch) {
                    url = authorLinkMatch[1];
                } else {
                    url = `https://news.xfastest.com/author/${name}/`;
                }
            }

            if (name) {
                return { name, avatar, url };
            }
        } catch (e) {
            tfd.sysError('XFastest', `作者解析錯誤: ${e.message}`);
        }

        return null;
    }

    /**
     * 解析內文摘要
     * @param {string} html
     * @returns {string|null}
     */
    parseContentSummary(html) {
        try {
            // XFastest 的文章內容在 div.vw-post-content 內的 <p> 標籤
            const contentMatch = html.match(/<div[^>]*class="[^"]*vw-post-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*vw-tag/i);
            const contentHtml = contentMatch ? contentMatch[1] : html;

            const paragraphs = [];
            const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            let match;

            while ((match = pTagRegex.exec(contentHtml)) !== null) {
                let text = match[1]
                    .replace(/<img[^>]*>/gi, '')  // 移除圖片標籤
                    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')  // 保留連結文字
                    .replace(/<[^>]+>/g, '')  // 移除其他 HTML 標籤
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                // 過濾太短的段落和只有圖片的段落
                if (text.length > 15 &&
                    !text.includes('廣告') &&
                    !text.includes('推薦') &&
                    !text.includes('延伸閱讀') &&
                    !text.includes('看更多') &&
                    !text.includes('訂閱')) {
                    paragraphs.push(text);
                }
            }

            if (paragraphs.length > 0) {
                let summary = paragraphs.slice(0, 3).join('\n\n');
                if (summary.length > 500) {
                    summary = summary.substring(0, 497) + '...';
                }
                return summary;
            }
        } catch (e) {
            tfd.sysError('XFastest', `內文摘要解析錯誤: ${e.message}`);
        }

        return null;
    }

    /**
     * 解析標籤
     * @param {string} html
     * @returns {string[]}
     */
    parseTags(html) {
        const tags = [];
        const tagRegex = /<a[^>]*rel="tag"[^>]*>([^<]+)<\/a>/gi;
        let match;

        while ((match = tagRegex.exec(html)) !== null) {
            const tag = this.decodeHtmlEntities(match[1].trim());
            if (tag && !tags.includes(tag)) {
                tags.push(tag);
            }
        }

        return tags;
    }

    /**
     * 解析發布時間
     * @param {string} html
     * @returns {string|null}
     */
    parsePublishedTime(html) {
        // <time datetime="2026-02-27T14:06:14+08:00">
        const timeMatch = html.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i);
        if (timeMatch) {
            return timeMatch[1];
        }
        return null;
    }

    /**
     * 解析瀏覽次數
     * @param {string} html
     * @returns {string|null}
     */
    parseViews(html) {
        // 瀏覽次數在 vw-post-meta-icons 區域，格式如 "20,811 views"
        const viewsMatch = html.match(/([\d,]+)\s*views/i);
        if (viewsMatch) {
            return viewsMatch[1];
        }
        return null;
    }

    /**
     * 解碼 HTML 實體
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
     * 格式化日期
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
     */
    buildArticleEmbed(articleData, originalURL) {
        const embed = new EmbedBuilder();
        embed.setColor(0xDD3333); // XFastest 主題紅色

        // Author 區塊：作者名稱 + 頭像
        if (articleData.authorName) {
            const authorOpts = {
                name: articleData.authorName,
                url: articleData.authorURL || `https://news.xfastest.com/author/${articleData.authorName}/`
            };
            if (articleData.authorAvatar) {
                authorOpts.iconURL = articleData.authorAvatar;
            }
            embed.setAuthor(authorOpts);
        } else {
            embed.setAuthor({
                name: this.name,
                iconURL: this.iconURL,
                url: 'https://news.xfastest.com'
            });
        }

        // 標題
        if (articleData.title) {
            let title = articleData.title;
            if (title.length > 250) {
                title = title.substring(0, 247) + '...';
            }
            embed.setTitle(title);
            embed.setURL(originalURL);
        }

        // 描述：優先使用內文摘要，備用 OG description
        const description = articleData.contentSummary || articleData.description;
        if (description) {
            let desc = description;
            if (desc.length > 500) {
                desc = desc.substring(0, 497) + '...';
            }
            embed.setDescription(desc);
        }

        // 圖片
        if (articleData.image) {
            embed.setImage(articleData.image);
        }

        // 欄位
        const fields = [];

        if (articleData.datePublished) {
            fields.push({
                name: '📅 發布時間',
                value: this.formatDate(articleData.datePublished),
                inline: true
            });
        }

        if (articleData.views) {
            fields.push({
                name: '👁️ 瀏覽',
                value: articleData.views,
                inline: true
            });
        }

        if (articleData.tags && articleData.tags.length > 0) {
            const tagStr = articleData.tags.slice(0, 5).map(t => `\`${t}\``).join(' ');
            fields.push({
                name: '🏷️ 標籤',
                value: tagStr,
                inline: false
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // Footer
        embed.setFooter({
            text: 'XFastest 最速科技 | Peko Embed',
            iconURL: this.iconURL
        });

        // 時間戳
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
            .setTitle('XFastest 文章提取失敗')
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
            siteName: 'xfastest',
            contentType: 'error'
        };
    }
}

module.exports = TFDXFastestExtractor;
