/**
 * TFD 系統 - LINE TODAY 提取器
 * 提取 LINE TODAY 新聞文章資訊並生成 Embed
 */

const { EmbedBuilder } = require('discord.js');
const HTTPClient = require('../../src/shared/http/http-client');
const URLConverterLogger = require('../utils/url-converter-logger');
const tfd = require('../../utils/tfd-logger');

class TFDLineTodayExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.name = 'LINE TODAY';
        this.iconURL = 'https://today.line.me/favicon.ico';
    }

    /**
     * 處理 LINE TODAY URL
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { extractedData, originalURL } = matchResult;
        const { language, articleId } = extractedData;

        try {
            tfd.sys('LINE-TODAY', `獲取文章: ${articleId} (${language})`);

            // 獲取頁面 HTML
            const html = await this.httpClient.fetchHTML(originalURL, {
                timeout: 10000
            });

            if (!html || typeof html !== 'string' || html.length < 100) {
                throw new Error('無法獲取頁面內容或頁面內容無效');
            }

            // 解析 Open Graph 資料
            const articleData = this.parseOpenGraphData(html);

            if (!articleData.title) {
                throw new Error('無法解析文章資料');
            }

            tfd.sys('LINE-TODAY', `成功獲取文章: ${articleData.title}`);

            // 建立 Embed
            const embed = this.buildArticleEmbed(articleData, originalURL);

            // 記錄網址轉換
            URLConverterLogger.logConversion('linetoday', message, `文章: ${articleData.title}`);

            return {
                success: true,
                embed: embed,
                siteName: 'linetoday',
                contentType: 'article',
                articleData: articleData
            };

        } catch (error) {
            tfd.sysError('LINE-TODAY', `處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 解析 Open Graph Meta Tags
     * @param {string} html - 頁面 HTML
     * @returns {Object} 文章資料
     */
    parseOpenGraphData(html) {
        const data = {};

        // 提取標題
        const ogTitleMatch = html.match(/<meta property="og:title" content="(.*?)"/i);
        if (ogTitleMatch) {
            // 移除 "| LINE TODAY" 和 "| 來源名稱 | LINE TODAY" 後綴
            let title = ogTitleMatch[1];
            // 先移除 "| LINE TODAY"
            title = title.replace(/\s*\|\s*LINE TODAY\s*$/i, '').trim();
            // 再移除可能的 "| 來源名稱" (如 "| TVBS")
            title = title.replace(/\s*\|\s*[^|]+\s*$/, '').trim();
            data.title = title;
        }

        // 提取描述
        const ogDescMatch = html.match(/<meta property="og:description" content="(.*?)"/i);
        if (ogDescMatch) {
            data.description = ogDescMatch[1];
        }

        // 提取圖片
        const ogImageMatch = html.match(/<meta property="og:image" content="(.*?)"/i);
        if (ogImageMatch) {
            data.image = ogImageMatch[1];
        }

        // 提取來源/提供者
        const providerMatch = html.match(/<meta name="provider" content="(.*?)"/i);
        if (providerMatch) {
            data.provider = providerMatch[1];
        }

        // 提取作者
        const authorMatch = html.match(/<meta name="author" content="(.*?)"/i);
        if (authorMatch) {
            data.author = authorMatch[1];
        }

        // 提取關鍵字
        const keywordsMatch = html.match(/<meta name="news_keywords" content="(.*?)"/i);
        if (keywordsMatch) {
            data.keywords = keywordsMatch[1].split(',').map(k => k.trim());
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
        embed.setColor(0x00C300); // LINE 綠色

        // 設定 Author: 顯示來源媒體
        if (articleData.provider) {
            embed.setAuthor({
                name: articleData.provider,
                iconURL: this.iconURL,
                url: originalURL
            });
        }

        // 設定標題
        if (articleData.title) {
            // 限制標題長度（Discord 限制 256 字）
            let title = articleData.title;
            if (title.length > 250) {
                title = title.substring(0, 247) + '...';
            }
            embed.setTitle(title);
            embed.setURL(originalURL);
        }

        // 設定描述
        if (articleData.description) {
            // 限制描述長度（Discord 限制 4096 字）
            let description = articleData.description;
            if (description.length > 500) {
                description = description.substring(0, 497) + '...';
            }
            embed.setDescription(description);
        }

        // 設定圖片
        if (articleData.image) {
            embed.setImage(articleData.image);
        }

        // 添加額外資訊欄位
        if (articleData.author || articleData.keywords) {
            const fields = [];

            if (articleData.author) {
                fields.push({
                    name: '✍️ 作者',
                    value: articleData.author,
                    inline: true
                });
            }

            if (articleData.keywords && articleData.keywords.length > 0) {
                // 只顯示前 5 個關鍵字
                const keywords = articleData.keywords.slice(0, 5).map(k => `#${k}`).join(' ');
                fields.push({
                    name: '🏷️ 關鍵字',
                    value: keywords,
                    inline: true
                });
            }

            if (fields.length > 0) {
                embed.addFields(fields);
            }
        }

        // 設定 Footer
        embed.setFooter({
            text: 'LINE TODAY | Peko Embed',
            iconURL: this.iconURL
        });

        // 設定時間戳
        embed.setTimestamp();

        return embed;
    }

    /**
     * 創建錯誤響應
     */
    createErrorResponse(errorMessage, originalURL) {
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('LINE TODAY 提取失敗')
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
            siteName: 'linetoday',
            contentType: 'error'
        };
    }
}

module.exports = TFDLineTodayExtractor;
