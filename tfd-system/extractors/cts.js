/**
 * pekoembed 系統 - 華視新聞網提取器
 * 解析頁面內嵌的 Nuxt SSR JSON（__NUXT_DATA__）取得文章資料
 */

const { EmbedBuilder } = require('discord.js');
const HTTPClient = require('../utils/http-client');
const URLConverterLogger = require('../utils/url-converter-logger');
const tfd = require('../../utils/tfd-logger');

const CTS_ICON = 'https://news.cts.com.tw/favicon.ico';
const CTS_COLOR = 0x005BAC; // 華視藍

class pekoembedCTSExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.name = '華視新聞';
        this.iconURL = CTS_ICON;
    }

    async extract(matchResult, message = null) {
        const { originalURL } = matchResult;

        try {
            const html = await this.httpClient.fetchHTML(originalURL);

            if (!html || (typeof html === 'object' && html.error)) {
                throw new Error(`無法取得頁面 (HTTP ${html?.status || 0})`);
            }

            const articleData = this.parseNuxtData(html);

            if (!articleData || !articleData.title) {
                throw new Error('無法解析文章資料');
            }

            const embed = this.buildArticleEmbed(articleData, originalURL);

            URLConverterLogger.logConversion('cts', message, `文章: ${articleData.title}`);

            return {
                success: true,
                embed,
                siteName: 'cts',
                contentType: 'article',
                articleData
            };

        } catch (error) {
            tfd.sysError('CTS', `處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 從 HTML 中解析 __NUXT_DATA__ 並還原文章物件
     */
    parseNuxtData(html) {
        const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!match) throw new Error('找不到 __NUXT_DATA__');

        const arr = JSON.parse(match[1]);

        // 找包含 article + seo + extendedReading 的容器物件
        let articleIdx = null;
        for (let i = 0; i < arr.length; i++) {
            const val = arr[i];
            if (val && typeof val === 'object' && !Array.isArray(val) &&
                'article' in val && 'seo' in val && 'extendedReading' in val) {
                articleIdx = val.article;
                break;
            }
        }

        if (articleIdx === null) throw new Error('找不到文章資料索引');

        return this.resolve(arr, articleIdx);
    }

    /**
     * 遞迴還原 Nuxt dehydrated 格式
     * 陣列中的整數值為其他元素的索引（參考）
     */
    resolve(arr, idx, depth = 0) {
        if (depth > 20 || idx === null || idx === undefined) return idx;

        const val = arr[idx];
        if (val === null || val === undefined) return null;
        if (typeof val === 'boolean' || typeof val === 'string') return val;

        if (Array.isArray(val)) {
            return val.map(v => typeof v === 'number' ? this.resolve(arr, v, depth + 1) : v);
        }

        if (typeof val === 'object') {
            const result = {};
            for (const [k, v] of Object.entries(val)) {
                result[k] = typeof v === 'number' ? this.resolve(arr, v, depth + 1) : v;
            }
            return result;
        }

        return val;
    }

    /**
     * 將 HTML 字串轉為純文字
     */
    extractText(html) {
        return html
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\r\n|\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+/g, ' ')
            .trim();
    }

    buildArticleEmbed(article, originalURL) {
        const embed = new EmbedBuilder().setColor(CTS_COLOR);

        // Author
        const categoryName = typeof article.category === 'string' ? article.category : null;
        embed.setAuthor({
            name: categoryName ? `華視新聞 · ${categoryName}` : '華視新聞',
            iconURL: this.iconURL,
            url: 'https://news.cts.com.tw'
        });

        // Title
        if (article.title) {
            const title = article.title.length > 250
                ? article.title.slice(0, 247) + '...'
                : article.title;
            embed.setTitle(title).setURL(originalURL);
        }

        // Description（內文純文字）
        const bodyText = article.content ? this.extractText(article.content) : '';
        if (bodyText) {
            const trimmed = bodyText.length > 450 ? bodyText.slice(0, 447) + '...' : bodyText;
            embed.setDescription(trimmed);
        }

        // 封面圖
        const imageUrl = article.coverImage?.imageUrl;
        if (imageUrl) embed.setImage(imageUrl);

        // Fields
        const fields = [];

        // 資訊行：時間 / 作者 / 地點
        const metaParts = [];
        if (article.publishTime) metaParts.push(article.publishTime);
        if (article.author) metaParts.push(article.author);
        if (article.location) metaParts.push(article.location);
        if (metaParts.length > 0) {
            fields.push({ name: '資訊', value: metaParts.join(' / '), inline: false });
        }

        // YouTube 影片
        if (article.youtubeId) {
            fields.push({
                name: '影片',
                value: `https://www.youtube.com/watch?v=${article.youtubeId}`,
                inline: false
            });
        }

        // 標籤
        if (Array.isArray(article.tags) && article.tags.length > 0) {
            fields.push({
                name: '標籤',
                value: article.tags.map(t => `#${t}`).join('　'),
                inline: false
            });
        }

        if (fields.length > 0) embed.addFields(fields);

        embed.setFooter({ text: '華視新聞網 | Peko Embed', iconURL: this.iconURL });

        try {
            embed.setTimestamp(article.publishTime ? new Date(article.publishTime) : new Date());
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
                .setTitle('華視新聞提取失敗')
                .setDescription(`錯誤: ${errorMessage}`)
                .setURL(originalURL)
                .setFooter({ text: 'Peko Embed' })
                .setTimestamp(),
            siteName: 'cts',
            contentType: 'error'
        };
    }
}

module.exports = pekoembedCTSExtractor;
