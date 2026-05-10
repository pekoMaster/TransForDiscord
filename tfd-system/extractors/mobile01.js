/**
 * Mobile01 論壇提取器
 * 使用 HTTP + cheerio 解析 HTML（無需 puppeteer）
 */

const { EmbedBuilder } = require('discord.js');
const cheerio = require('cheerio');
const HTTPClient = require('../utils/http-client');

class Mobile01Extractor {
    constructor() {
        this.name = 'Mobile01';
        this.iconURL = 'https://attach2.mobile01.com/images/logo/logo.png';
        this.httpClient = new HTTPClient();
    }

    async extract(matchResult, message = null) {
        const { originalURL, extractedData } = matchResult;
        const { topicId, forumId, page } = extractedData;

        console.log(`[Mobile01] 開始提取: topicId=${topicId}, forumId=${forumId}, page=${page || 1}`);

        try {
            const result = await this.httpClient.get(originalURL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
                }
            });

            if (!result.success || !result.data) {
                throw new Error(`HTTP 請求失敗: ${result.status || 'unknown'}`);
            }

            const html = typeof result.data === 'string' ? result.data : String(result.data);
            const $ = cheerio.load(html);

            const title = $('h1').first().text().trim() ||
                          $('meta[property="og:title"]').attr('content') ||
                          null;

            if (!title) {
                throw new Error('無法獲取文章標題');
            }

            let author = null;
            const authorLink = $('.l-articlePage__author a[href*="userinfo"]');
            if (authorLink.length) {
                author = authorLink.first().text().trim();
            }
            if (!author) {
                author = $('meta[property="dable:author"]').attr('content') || null;
            }

            const images = [];
            $('article img').each((_, img) => {
                const src = $(img).attr('src') || $(img).attr('data-src');
                if (src && src.includes('attach.mobile01.com') && !src.includes('avatar') && !src.includes('icon')) {
                    images.push(src);
                }
            });

            let content = null;
            const firstArticle = $('article').first();
            if (firstArticle.length) {
                const clone = firstArticle.clone();
                clone.find('blockquote').remove();
                content = clone.text().trim().substring(0, 300);
            }
            if (!content) {
                content = $('meta[property="og:description"]').attr('content') || null;
            }

            const publishTime = $('meta[property="article:published_time"]').attr('content') || null;
            const section = $('meta[property="article:section"]').attr('content') || null;

            console.log(`[Mobile01] 提取成功: ${title}`);
            return this.createResponse({ title, author, images, content, publishTime, section }, originalURL, page);

        } catch (error) {
            console.error(`[Mobile01] 提取失敗: ${error.message}`);
            return {
                success: false,
                error: error.message,
                siteName: 'mobile01'
            };
        }
    }

    createResponse(data, originalURL, page) {
        const embed = new EmbedBuilder()
            .setColor(0x0066CC)
            .setTitle(data.title)
            .setURL(originalURL)
            .setAuthor({
                name: 'Mobile01',
                iconURL: this.iconURL,
                url: 'https://www.mobile01.com'
            });

        if (data.content) {
            let description = data.content;
            if (description.length > 250) {
                description = description.substring(0, 250) + '...';
            }
            embed.setDescription(description);
        }

        const fields = [];
        if (data.author) {
            fields.push({ name: '作者', value: data.author, inline: true });
        }
        if (data.section) {
            fields.push({ name: '分類', value: data.section, inline: true });
        }
        if (page && page > 1) {
            fields.push({ name: '頁數', value: `第 ${page} 頁`, inline: true });
        }
        if (fields.length > 0) {
            embed.addFields(fields);
        }

        if (data.images && data.images.length > 0) {
            embed.setImage(data.images[0]);
        }

        let footerText = 'Mobile01 論壇';
        if (data.publishTime) {
            const date = new Date(data.publishTime);
            footerText += ` • ${date.toLocaleDateString('zh-TW')}`;
        }
        if (data.images && data.images.length > 1) {
            footerText += ` • 共 ${data.images.length} 張圖片`;
        }
        embed.setFooter({ text: footerText });

        let multipleImages = null;
        if (data.images && data.images.length >= 2 && data.images.length <= 4) {
            multipleImages = data.images;
        }

        return {
            success: true,
            embed: embed,
            siteName: 'mobile01',
            contentType: 'forum_post',
            multipleImages: multipleImages,
            data: data
        };
    }
}

module.exports = Mobile01Extractor;
