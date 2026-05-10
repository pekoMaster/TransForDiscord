/**
 * Ermiana 系統 - MSN 新聞提取器
 * 使用 MSN CAPI 取得文章結構化資料
 * API: https://assets.msn.com/content/view/v2/Detail/{locale}/{articleId}
 */

const { EmbedBuilder } = require('discord.js');
const HTTPClient = require('../utils/http-client');
const URLConverterLogger = require('../utils/url-converter-logger');

const MSN_ICON = 'https://img-s-msn-com.akamaized.net/tenant/amp/entityid/BBfTWDV.img';
const MSN_COLOR = 0x0067B8; // MSN 深藍

class ErmianaMSNExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.name = 'MSN 新聞';
        this.iconURL = MSN_ICON;
    }

    /**
     * 處理 MSN URL
     */
    async extract(matchResult, message = null) {
        const { extractedData, originalURL } = matchResult;
        const { locale, articleId } = extractedData;

        try {
            const apiURL = `https://assets.msn.com/content/view/v2/Detail/${locale}/${articleId}`;
            const data = await this.httpClient.fetchJSON(apiURL);

            if (!data || !data.title) {
                throw new Error('CAPI 無回應或缺少標題');
            }

            const articleData = this.parseArticleData(data);
            const embed = this.buildArticleEmbed(articleData, originalURL);

            URLConverterLogger.logConversion('msn', message, null, null, `文章: ${articleData.title}`);

            return {
                success: true,
                embed,
                siteName: 'msn',
                contentType: 'article',
                articleData
            };

        } catch (error) {
            console.error(`[MSN] 處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 從 CAPI 回應解析文章資料
     */
    parseArticleData(data) {
        const article = {
            title: data.title || '',
            abstract: data.abstract || '',
            publishedDateTime: data.publishedDateTime || null,
            sourceHref: data.sourceHref || null,
            providerName: null,
            providerIconURL: null,
            reporter: null,
            image: null,
            body: null
        };

        // 來源媒體
        if (data.provider) {
            article.providerName = data.provider.name || null;
            article.providerIconURL =
                data.provider.lightSquareLogo?.url ||
                data.provider.logo?.url ||
                null;
        }

        // 圖片（imageResources 是以數字為 key 的物件）
        if (data.imageResources) {
            const images = Object.values(data.imageResources);
            if (images.length > 0) {
                article.image = images[0].url || null;
            }
        }

        // 從 body HTML 取第一個 <p> 作為記者欄，其餘取文章摘要
        if (data.body) {
            const paragraphs = this.extractParagraphs(data.body);
            if (paragraphs.length > 0) {
                // 第一段若符合「記者/來源 報導」格式，視為記者行
                const first = paragraphs[0];
                if (first.length < 50 && (first.includes('報導') || first.includes('記者') || first.includes('編輯'))) {
                    article.reporter = first;
                    article.body = paragraphs.slice(1).join('\n\n');
                } else {
                    article.body = paragraphs.join('\n\n');
                }
            }
        }

        return article;
    }

    /**
     * 從 HTML body 字串提取純文字段落
     */
    extractParagraphs(html) {
        const paragraphs = [];
        const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        let match;
        while ((match = pRegex.exec(html)) !== null) {
            const text = match[1]
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, ' ')
                .trim();
            if (text.length > 0) paragraphs.push(text);
        }
        return paragraphs;
    }

    /**
     * 格式化 ISO 日期為台灣時間
     */
    formatDate(dateStr) {
        if (!dateStr) return null;
        try {
            return new Date(dateStr).toLocaleString('zh-TW', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false,
                timeZone: 'Asia/Taipei'
            });
        } catch (_) {
            return dateStr;
        }
    }

    /**
     * 建立文章 Embed
     */
    buildArticleEmbed(article, originalURL) {
        const embed = new EmbedBuilder().setColor(MSN_COLOR);

        // Author 欄：來源媒體名稱 + 其網站連結
        embed.setAuthor({
            name: article.providerName || 'MSN 新聞',
            iconURL: article.providerIconURL || this.iconURL,
            url: article.sourceHref || 'https://www.msn.com'
        });

        // 標題
        if (article.title) {
            embed.setTitle(article.title.length > 250 ? article.title.slice(0, 247) + '...' : article.title);
            embed.setURL(originalURL);
        }

        // 描述：記者行（斜體）+ 摘要或內文
        const bodyText = article.body || article.abstract || '';
        const descLines = [];
        if (article.reporter) descLines.push(`*${article.reporter}*`);
        if (bodyText) {
            const trimmed = bodyText.length > 450 ? bodyText.slice(0, 447) + '...' : bodyText;
            descLines.push(trimmed);
        }
        if (descLines.length > 0) embed.setDescription(descLines.join('\n\n'));

        // 圖片
        if (article.image) embed.setImage(article.image);

        // 發布時間
        if (article.publishedDateTime) {
            embed.addFields([{
                name: '發布時間',
                value: this.formatDate(article.publishedDateTime),
                inline: true
            }]);
        }

        // Footer
        embed.setFooter({ text: 'MSN 新聞 | Peko Embed', iconURL: this.iconURL });

        // Timestamp
        try {
            embed.setTimestamp(article.publishedDateTime ? new Date(article.publishedDateTime) : new Date());
        } catch (_) {
            embed.setTimestamp();
        }

        return embed;
    }

    createErrorResponse(errorMessage, originalURL) {
        return {
            success: false,
            error: errorMessage,
            embed: new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('MSN 文章提取失敗')
                .setDescription(`錯誤: ${errorMessage}`)
                .setURL(originalURL)
                .setFooter({ text: 'Peko Embed' })
                .setTimestamp(),
            siteName: 'msn',
            contentType: 'error'
        };
    }
}

module.exports = ErmianaMSNExtractor;
