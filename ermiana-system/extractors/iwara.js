/**
 * Ermiana 系統 - Iwara 提取器 (Puppeteer 版本)
 * 使用 Puppeteer 爬蟲技術提取完整 IWARA 影片資訊
 */

const IwaraExtractor = require('../../utils/iwara-extractor');
const { EmbedBuilder } = require('discord.js');

class IwaraErmianaExtractor {
    constructor() {
        this.iwara = new IwaraExtractor();
        this.name = 'Iwara';
    }

    /**
     * 處理 Iwara URL
     * @param {Object} matchResult
     * @returns {Promise<Object>}
     */
    async extract(matchResult) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            console.log(`[IWARA Ermiana] 開始處理: ${originalURL}`);

            // 檢查是否為 IWARA 影片 URL
            if (!this.iwara.isIwaraURL(originalURL)) {
                throw new Error('不是有效的 IWARA 影片 URL');
            }

            // 使用 Puppeteer 提取完整影片資訊
            const extractResult = await this.iwara.extractVideoInfo(originalURL);

            if (!extractResult.success) {
                throw new Error(extractResult.error);
            }

            // 生成 Discord Embed
            const embed = this.createEnhancedEmbed(extractResult, originalURL);

            console.log(`[IWARA Ermiana] 提取成功: ${extractResult.title}`);

            return {
                success: true,
                siteName: 'iwara',
                contentType: 'video',
                embed: embed,
                data: extractResult,
                videoURL: extractResult.videoURL
            };

        } catch (error) {
            console.error(`[IWARA Ermiana] 提取失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 創建增強版 Discord Embed
     * @param {Object} extractResult
     * @param {string} originalURL
     * @returns {Object}
     */
    createEnhancedEmbed(extractResult, originalURL) {
        const embed = new EmbedBuilder()
            .setTitle(extractResult.title)
            .setColor(0x1f4e95) // IWARA 藍色主題
            .setURL(originalURL);

        // 設置作者資訊
        if (extractResult.author) {
            const authorOptions = {
                name: extractResult.author
            };
            if (extractResult.authorAvatar) {
                authorOptions.iconURL = extractResult.authorAvatar;
            }
            embed.setAuthor(authorOptions);
        }

        // 設置縮圖
        if (extractResult.thumbnail) {
            embed.setImage(extractResult.thumbnail);
        }

        // 統計資訊
        const statsFields = [];

        if (extractResult.views > 0) {
            statsFields.push(`👁️ ${extractResult.views.toLocaleString()} 次觀看`);
        }

        if (extractResult.likes > 0) {
            statsFields.push(`❤️ ${extractResult.likes.toLocaleString()} 次按讚`);
        }

        if (statsFields.length > 0) {
            embed.addFields({
                name: '📊 統計資訊',
                value: statsFields.join('\n'),
                inline: true
            });
        }

        // 影片連結
        if (extractResult.videoURL) {
            embed.addFields({
                name: '🎬 影片連結',
                value: `[點擊觀看影片](${extractResult.videoURL})`,
                inline: true
            });
        }

        // 設置 footer
        embed.setFooter({
            text: `IWARA • ID: ${extractResult.videoId} • 提取耗時: ${extractResult.extractionTime}ms`
        });

        embed.setTimestamp();

        return embed;
    }

    /**
     * 建立錯誤回應
     * @param {string} message
     * @param {string} url
     * @returns {Object}
     */
    createErrorResponse(message, url) {
        const embed = new EmbedBuilder()
            .setTitle('❌ IWARA 影片提取失敗')
            .setDescription(`錯誤: ${message}`)
            .setColor(0xff0000)
            .setURL(url)
            .setTimestamp();

        return {
            success: false,
            error: message,
            embed: embed,
            siteName: 'iwara'
        };
    }
}

module.exports = IwaraErmianaExtractor;