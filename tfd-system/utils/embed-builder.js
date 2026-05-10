/**
 * TFD 系統 - Discord Embed 建構器
 * 生成豐富的 Discord 嵌入式訊息
 */

const { EmbedBuilder } = require('discord.js');

class TFDEmbedBuilder {
    constructor() {
        this.defaultColor = 0x5865F2; // Discord Blurple
        this.maxTitleLength = 256;
        this.maxDescriptionLength = 4096;
        this.maxFieldValueLength = 1024;
        this.maxFieldNameLength = 256;
        this.maxFields = 25;
    }

    /**
     * 建立基本的嵌入式訊息
     * @param {Object} data
     * @returns {EmbedBuilder}
     */
    createBasicEmbed(data) {
        const embed = new EmbedBuilder();

        // 標題
        if (data.title) {
            embed.setTitle(this.truncateText(data.title, this.maxTitleLength));
        }

        // 描述
        if (data.description) {
            embed.setDescription(this.truncateText(data.description, this.maxDescriptionLength));
        }

        // URL
        if (data.url) {
            embed.setURL(data.url);
        }

        // 圖片
        if (data.image) {
            embed.setImage(data.image);
        }

        // 縮圖
        if (data.thumbnail) {
            embed.setThumbnail(data.thumbnail);
        }

        // 顏色
        embed.setColor(data.color || this.defaultColor);

        // 作者
        if (data.author) {
            const authorOptions = {
                name: this.truncateText(data.author.name || '', this.maxFieldNameLength)
            };
            // 只在有值時才添加 iconURL 和 url
            if (data.author.iconURL) authorOptions.iconURL = data.author.iconURL;
            if (data.author.url) authorOptions.url = data.author.url;

            embed.setAuthor(authorOptions);
        }

        // 頁腳
        if (data.footer) {
            const footerOptions = {
                text: this.truncateText(data.footer.text || '', this.maxFieldNameLength)
            };
            // 只在有值時才添加 iconURL
            if (data.footer.iconURL) footerOptions.iconURL = data.footer.iconURL;

            embed.setFooter(footerOptions);
        }

        // 時間戳記
        if (data.timestamp) {
            embed.setTimestamp(new Date(data.timestamp));
        }

        return embed;
    }

    /**
     * 建立社交媒體嵌入式訊息
     * @param {Object} data
     * @returns {EmbedBuilder}
     */
    createSocialMediaEmbed(data) {
        const embed = this.createBasicEmbed(data);

        // 社交媒體特有的欄位
        if (data.stats) {
            const fields = [];

            if (data.stats.likes !== undefined) {
                fields.push({
                    name: '👍 讚',
                    value: this.formatNumber(data.stats.likes),
                    inline: true
                });
            }

            if (data.stats.retweets !== undefined) {
                fields.push({
                    name: '🔄 轉推',
                    value: this.formatNumber(data.stats.retweets),
                    inline: true
                });
            }

            if (data.stats.comments !== undefined) {
                fields.push({
                    name: '💬 留言',
                    value: this.formatNumber(data.stats.comments),
                    inline: true
                });
            }

            if (data.stats.views !== undefined) {
                fields.push({
                    name: '👁️ 觀看',
                    value: this.formatNumber(data.stats.views),
                    inline: true
                });
            }

            if (fields.length > 0) {
                embed.addFields(fields.slice(0, this.maxFields));
            }
        }

        return embed;
    }

    /**
     * 建立藝術作品嵌入式訊息
     * @param {Object} data
     * @returns {EmbedBuilder}
     */
    createArtworkEmbed(data) {
        const embed = this.createBasicEmbed(data);

        // 藝術作品特有的欄位
        const fields = [];

        if (data.artist) {
            fields.push({
                name: '🎨 藝術家',
                value: data.artist,
                inline: true
            });
        }

        if (data.tags && data.tags.length > 0) {
            fields.push({
                name: '🏷️ 標籤',
                value: data.tags.slice(0, 10).join(', '),
                inline: false
            });
        }

        if (data.dimensions) {
            fields.push({
                name: '📐 尺寸',
                value: data.dimensions,
                inline: true
            });
        }

        if (data.rating) {
            fields.push({
                name: '⭐ 評分',
                value: data.rating,
                inline: true
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields.slice(0, this.maxFields));
        }

        return embed;
    }

    /**
     * 建立論壇文章嵌入式訊息
     * @param {Object} data
     * @returns {EmbedBuilder}
     */
    createForumEmbed(data) {
        const embed = this.createBasicEmbed(data);

        // 論壇特有的欄位
        const fields = [];

        if (data.board) {
            fields.push({
                name: '📋 看板',
                value: data.board,
                inline: true
            });
        }

        if (data.replies !== undefined) {
            fields.push({
                name: '💬 回覆',
                value: this.formatNumber(data.replies),
                inline: true
            });
        }

        if (data.score !== undefined) {
            fields.push({
                name: '👍 推文',
                value: this.formatNumber(data.score),
                inline: true
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields.slice(0, this.maxFields));
        }

        return embed;
    }

    /**
     * 建立影片嵌入式訊息
     * @param {Object} data
     * @returns {EmbedBuilder}
     */
    createVideoEmbed(data) {
        const embed = this.createBasicEmbed(data);

        // 影片特有的欄位
        const fields = [];

        if (data.duration) {
            fields.push({
                name: '⏱️ 時長',
                value: this.formatDuration(data.duration),
                inline: true
            });
        }

        if (data.views !== undefined) {
            fields.push({
                name: '👁️ 觀看次數',
                value: this.formatNumber(data.views),
                inline: true
            });
        }

        if (data.uploadDate) {
            fields.push({
                name: '📅 上傳日期',
                value: this.formatDate(data.uploadDate),
                inline: true
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields.slice(0, this.maxFields));
        }

        return embed;
    }

    /**
     * 建立錯誤嵌入式訊息
     * @param {string} message
     * @param {string} url
     * @returns {EmbedBuilder}
     */
    createErrorEmbed(message, url = null) {
        const embed = new EmbedBuilder()
            .setTitle('❌ 無法取得預覽')
            .setDescription(message)
            .setColor(0xFF0000); // 紅色

        if (url) {
            embed.setURL(url);
        }

        embed.setFooter({
            text: 'TFD 連結預覽系統',
            iconURL: null
        });

        return embed;
    }

    /**
     * 截斷文字到指定長度
     * @param {string} text
     * @param {number} maxLength
     * @returns {string}
     */
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) {
            return text;
        }

        return text.slice(0, maxLength - 3) + '...';
    }

    /**
     * 格式化數字
     * @param {number} num
     * @returns {string}
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    /**
     * 格式化持續時間
     * @param {number} seconds
     * @returns {string}
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    /**
     * 格式化日期
     * @param {string|Date} date
     * @returns {string}
     */
    formatDate(date) {
        try {
            const dateObj = typeof date === 'string' ? new Date(date) : date;
            return dateObj.toLocaleDateString('zh-TW');
        } catch (error) {
            return date.toString();
        }
    }

    /**
     * 取得網站特定的顏色
     * @param {string} siteName
     * @returns {number}
     */
    getSiteColor(siteName) {
        const colors = {
            twitter: 0x1DA1F2,
            instagram: 0xE4405F,
            tiktok: 0x000000,
            plurk: 0xFF6600,
            bluesky: 0x00D9FF,
            ptt: 0x800080,
            bahamut: 0x0066CC,
            dcard: 0x006AA6,
            pixiv: 0x0096FA,
            bilibili: 0x00A1D6,
            pchome: 0xFF6600,
            youtube: 0xFF0000
        };

        return colors[siteName] || this.defaultColor;
    }
}

module.exports = TFDEmbedBuilder;