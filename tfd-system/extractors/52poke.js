/**
 * TFD 系統 - 寶可夢百科 (52Poke Wiki) 提取器
 * 抓取 wiki.52poke.com 頁面的標題和簡介
 */

const { EmbedBuilder } = require('discord.js');
const HTTPClient = require('../../src/shared/http/http-client');
const URLConverterLogger = require('../../src/shared/logging/url-converter-logger');
const cheerio = require('cheerio');

const POKE_COLOR = 0xE3350D; // 寶可夢紅
const POKE_ICON = 'https://s1.52poke.wiki/assets/favicon.ico';

class PokeWikiExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.name = '寶可夢百科';
    }

    async extract(matchResult, message = null) {
        const { originalURL, extractedData } = matchResult;
        const pageName = decodeURIComponent(extractedData.pageName || '');

        try {
            const html = await this.httpClient.fetchHTML(originalURL, {
                timeout: 15000,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'zh-TW,zh;q=0.9',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!html || html.length < 200) {
                throw new Error('無法取得頁面內容');
            }

            const $ = cheerio.load(html);

            // 取得標題
            const title = $('#firstHeading').text().trim() || pageName;

            // 取得第一段內容作為描述
            let description = '';
            const contentParagraphs = $('#mw-content-text .mw-parser-output > p');
            for (let i = 0; i < contentParagraphs.length && i < 3; i++) {
                const text = $(contentParagraphs[i]).text().trim();
                if (text && text.length > 10) {
                    description = text;
                    break;
                }
            }

            if (description.length > 500) {
                description = description.substring(0, 497) + '...';
            }

            // 取得主圖片（如果有）
            let thumbnail = null;
            const infoboxImg = $('table.roundy img, table.infobox img, .pokemon-infobox img').first().attr('src');
            if (infoboxImg) {
                thumbnail = infoboxImg.startsWith('//') ? 'https:' + infoboxImg : infoboxImg;
            }

            // 建立 Embed
            const embed = new EmbedBuilder()
                .setColor(POKE_COLOR)
                .setTitle(title)
                .setURL(originalURL)
                .setFooter({ text: '神奇寶貝百科', iconURL: POKE_ICON });

            if (description) {
                embed.setDescription(description);
            }

            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }

            URLConverterLogger.logConversion('pokewiki', message, `${title}`);

            return {
                success: true,
                siteName: 'pokewiki',
                embed,
                originalURL
            };
        } catch (error) {
            URLConverterLogger.logError('pokewiki', originalURL, error.message);
            return {
                success: false,
                siteName: 'pokewiki',
                error: error.message,
                originalURL
            };
        }
    }
}

module.exports = PokeWikiExtractor;
