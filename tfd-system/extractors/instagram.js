/**
 * TFD 系統 - Instagram 提取器
 * 提取 Instagram 貼文和個人資料資訊
 */

const HTTPClient = require('../../src/shared/http/http-client');
const DOMParser = require('../../src/shared/html/dom-parser');
const TFDEmbedBuilder = require('../../src/shared/discord/embed-builder');
const URLConverterLogger = require('../../src/shared/logging/url-converter-logger');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const tfd = require('../../utils/tfd-logger');

class InstagramExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.domParser = new DOMParser();
        this.embedBuilder = new TFDEmbedBuilder();
        this.name = 'Instagram';
    }

    /**
     * 處理 Instagram URL
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            switch (patternName) {
                case 'post':
                    return await this.extractPost(extractedData.postId, originalURL, message);
                case 'reel':
                    return await this.extractReel(extractedData.reelId, originalURL, message);
                case 'story':
                    return await this.extractStory(extractedData.username, extractedData.storyId, originalURL, message);
                default:
                    throw new Error(`不支援的 Instagram 模式: ${patternName}`);
            }
        } catch (error) {
            tfd.sysError('TFD-Instagram', `提取失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 提取貼文資訊 - 使用 URL 轉換方式
     * @param {string} postId
     * @param {string} originalURL
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extractPost(postId, originalURL, message = null) {
        // 使用 URL 轉換方式：將 www.instagram.com 改為 www.kkinstagram.com
        const convertedURL = this.convertInstagramURL(originalURL);

        // 記錄 URL 轉換日誌
        URLConverterLogger.logConversion('instagram', message, convertedURL);

        // 回傳 URL 轉換結果
        return {
            success: true,
            siteName: 'instagram',
            contentType: 'url_conversion',
            convertedURL: convertedURL,
            data: {
                originalURL: originalURL,
                convertedURL: convertedURL,
                postId: postId
            }
        };
    }

    /**
     * 提取 Reel 資訊
     * @param {string} reelId
     * @param {string} originalURL
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extractReel(reelId, originalURL, message = null) {
        // Instagram Reels 轉換：instagram.com/reel → vxinstagram.com/reel
        const convertedURL = this.convertInstagramURL(originalURL);

        // 使用 Puppeteer 爬取 Reels 詳細資訊
        let reelsData = null;
        try {
            reelsData = await this.scrapeReelsWithPuppeteer(originalURL);
            tfd.sys('TFD-Instagram', `Reels 資料提取成功: ${JSON.stringify(reelsData)}`);
        } catch (error) {
            tfd.sysError('TFD-Instagram', `Reels 爬取失敗: ${error.message}`);
            // 爬取失敗時仍繼續處理，使用基本 URL 轉換
        }

        // 記錄 URL 轉換日誌
        URLConverterLogger.logConversion('instagram', message, convertedURL);

        // Instagram Reels 特殊處理：刪除原訊息並發送 embed 訊息
        const reelsMessage = this.createReelsFormattedMessageWithMetadata(message, convertedURL, reelsData);

        return {
            success: true,
            siteName: 'instagram',
            contentType: 'reel_with_metadata',  // 新的內容類型：帶有 metadata 的 Reels
            convertedURL: convertedURL,
            deleteOriginal: true,  // 標記需要刪除原訊息
            embed: reelsMessage.embed,  // 使用 embed 格式
            content: reelsMessage.content,
            data: {
                originalURL: originalURL,
                convertedURL: convertedURL,
                reelId: reelId,
                type: 'reel',
                metadata: reelsData
            }
        };
    }

    /**
     * 提取 Story 資訊
     * @param {string} username
     * @param {string} storyId
     * @param {string} originalURL
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extractStory(username, storyId, originalURL, message = null) {
        // Stories 使用特殊的 vxinstagram.com 轉換
        const convertedURL = this.convertInstagramURL(originalURL);

        // 記錄 URL 轉換日誌
        URLConverterLogger.logConversion('instagram', message, convertedURL);

        // Instagram Stories 特殊處理：刪除原訊息並發送 embed 訊息
        const storyMessage = this.createStoriesFormattedMessage(message, convertedURL);

        return {
            success: true,
            siteName: 'instagram',
            contentType: 'story_formatted',  // 特殊內容類型
            convertedURL: convertedURL,
            deleteOriginal: true,  // 標記需要刪除原訊息
            embed: storyMessage.embed,  // 使用 embed 格式
            content: storyMessage.content,
            data: {
                originalURL: originalURL,
                convertedURL: convertedURL,
                username: username,
                storyId: storyId,
                type: 'story'
            }
        };
    }

    /**
     * 創建 Instagram Stories 格式化訊息（Embed 格式）
     * @param {Object} message - Discord 訊息物件
     * @param {string} convertedURL - 轉換後的 URL
     * @returns {Object} - 包含 embed 和 content 的物件
     */
    createStoriesFormattedMessage(message, convertedURL) {
        const embed = new EmbedBuilder()
            .setColor(0xE4405F)  // Instagram 品牌色
            .setTitle('📱 Instagram Story')
            .setURL(convertedURL)
            .setFooter({
                text: 'Instagram',
                iconURL: 'https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png'
            })
            .setTimestamp();

        // 如果有用戶資訊，設定作者欄位
        if (message && message.author) {
            const displayName = message.member?.displayName || message.author.globalName || message.author.username;
            embed.setAuthor({
                name: `${displayName} 分享了一條 IG 限動`,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            });
        }

        // 影片連結放在 embed 之後
        const content = `[影片](${convertedURL})`;

        return {
            embed: embed,
            content: content
        };
    }

    /**
     * 創建 Instagram Reels 格式化訊息
     * @param {Object} message - Discord 訊息物件
     * @param {string} convertedURL - 轉換後的 URL
     * @returns {string}
     */
    createReelsFormattedMessage(message, convertedURL) {
        if (!message || !message.author) {
            return `[原網址](${convertedURL})`;
        }

        const displayName = message.member?.displayName || message.author.globalName || message.author.username;
        const userMention = `<@${message.author.id}>`;

        return `-# ${userMention} 發送了一條IG\n[原網址](${convertedURL})`;
    }

    /**
     * 創建 Instagram Reels 雙連結訊息
     * @param {string} originalURL - 原始 URL
     * @param {string} convertedURL - 轉換後的 URL
     * @returns {string}
     */
    createReelsDualLinksMessage(originalURL, convertedURL) {
        return `[原網址](${originalURL}) [轉換後網址](${convertedURL})`;
    }

    // 不再需要這些複雜的方法，因為我們使用簡單的 URL 轉換

    /**
     * 轉換 Instagram URL
     * @param {string} url
     * @returns {string}
     */
    convertInstagramURL(url) {
        try {
            // 所有 Instagram 連結統一使用 vxinstagram.com
            if (url.includes('www.instagram.com')) {
                return url.replace('www.instagram.com', 'vxinstagram.com');
            } else if (url.includes('instagram.com')) {
                return url.replace('instagram.com', 'vxinstagram.com');
            }

            return url;
        } catch (error) {
            tfd.sysError('TFD-Instagram', `URL 轉換失敗: ${error.message}`);
            return url;
        }
    }

    /**
     * 從 URL 提取用戶名
     * @param {string} url
     * @returns {string|null}
     */
    extractUsernameFromURL(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);

            // Instagram URL 格式: /username/p/postId 或 /reel/reelId
            if (pathParts.length >= 2 && !pathParts[0].includes('reel')) {
                return pathParts[0];
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * 從 HTML 解析 Instagram 資料
     * @param {string} url
     * @returns {Promise<Object>}
     */
    async fetchFromHTML(url) {
        const html = await this.httpClient.fetchHTML(url);
        if (!html) {
            throw new Error('無法取得 HTML 內容');
        }

        const metadata = this.domParser.extractMetadata(html);

        // 嘗試從 JSON-LD 中提取更多資訊
        const jsonLDData = this.extractJSONLD(html);

        return {
            type: 'html',
            caption: metadata.description || jsonLDData.caption || '',
            author: {
                username: this.extractUsername(url),
                displayName: metadata.author || jsonLDData.author || ''
            },
            thumbnail: metadata.image || '',
            mediaURL: metadata.image || '',
            isVideo: this.isVideoPost(html, metadata),
            timestamp: metadata.publishedTime || jsonLDData.datePublished || '',
            stats: {
                likes: jsonLDData.likes || 0,
                comments: jsonLDData.comments || 0
            }
        };
    }

    /**
     * 從 HTML 中提取 JSON-LD 資料
     * @param {string} html
     * @returns {Object}
     */
    extractJSONLD(html) {
        try {
            const $ = this.domParser.parse(html);
            const scripts = $('script[type="application/ld+json"]');

            for (let i = 0; i < scripts.length; i++) {
                try {
                    const jsonData = JSON.parse($(scripts[i]).html());
                    if (jsonData['@type'] === 'SocialMediaPosting') {
                        return {
                            caption: jsonData.headline || jsonData.description || '',
                            author: jsonData.author?.name || '',
                            datePublished: jsonData.datePublished || '',
                            likes: jsonData.interactionStatistic?.find(stat =>
                                stat.interactionType?.includes('LikeAction'))?.userInteractionCount || 0,
                            comments: jsonData.interactionStatistic?.find(stat =>
                                stat.interactionType?.includes('CommentAction'))?.userInteractionCount || 0
                        };
                    }
                } catch (parseError) {
                    continue;
                }
            }
        } catch (error) {
            // JSON-LD 解析失敗不影響主要流程
        }

        return {};
    }

    /**
     * 建立貼文回應
     * @param {Object} postData
     * @param {string} originalURL
     * @param {string} contentType
     * @returns {Object}
     */
    createPostResponse(postData, originalURL, contentType = 'post') {
        const typeEmoji = {
            post: '📷',
            reel: '🎬',
            story: '📱'
        };

        const typeName = {
            post: 'Instagram 貼文',
            reel: 'Instagram Reel',
            story: 'Instagram Story'
        };

        const embed = this.embedBuilder.createSocialMediaEmbed({
            title: `${typeEmoji[contentType]} ${typeName[contentType]}`,
            description: this.formatCaption(postData.caption),
            url: originalURL,
            color: this.embedBuilder.getSiteColor('instagram'),
            author: {
                name: `@${postData.author.username}`,
                iconURL: null
            },
            image: postData.mediaURL || postData.thumbnail,
            timestamp: postData.timestamp,
            stats: postData.stats,
            footer: {
                text: 'Instagram',
                iconURL: 'https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png'
            }
        });

        // 檢查是否為影片內容 (Reel 或有 isVideo 標記)
        const isVideoContent = contentType === 'reel' || postData.isVideo;

        // 如果是影片，調整顯示方式
        if (isVideoContent) {
            embed.setDescription(`🎥 影片\n\n${this.formatCaption(postData.caption)}`);
            // 移除圖片顯示，因為會在外部顯示連結
            embed.setImage(null);
        }

        const result = {
            success: true,
            embed: embed,
            siteName: 'instagram',
            contentType: contentType,
            data: postData
        };

        // 如果是影片內容，加入外部連結資訊
        if (isVideoContent) {
            result.hasVideo = true;
            result.videoLinks = [{
                url: originalURL,
                type: contentType
            }];
            tfd.sys('TFD-Instagram', `檢測到影片內容 (${contentType})，將在嵌入式訊息外顯示連結`);
        }

        return result;
    }

    /**
     * 建立錯誤回應
     * @param {string} message
     * @param {string} url
     * @returns {Object}
     */
    createErrorResponse(message, url) {
        return {
            success: false,
            error: message,
            embed: this.embedBuilder.createErrorEmbed(`Instagram 取得失敗: ${message}`, url),
            siteName: 'instagram'
        };
    }

    /**
     * 格式化貼文文字
     * @param {string} caption
     * @returns {string}
     */
    formatCaption(caption) {
        if (!caption) return '';

        // 移除多餘的空白和換行，但保留段落結構
        return caption
            .replace(/\n{3,}/g, '\n\n')  // 移除過多的換行
            .replace(/\s+/g, ' ')        // 移除多餘空白
            .trim()
            .substring(0, 500);          // 限制長度
    }

    /**
     * 從 HTML 字串中提取說明文字
     * @param {string} html
     * @returns {string}
     */
    extractCaptionFromHTML(html) {
        try {
            const $ = this.domParser.parse(html);
            // Instagram embed 通常包含說明文字
            const captionText = $('.Caption').text() ||
                               $('[data-testid="post-caption"]').text() ||
                               '';
            return captionText.trim();
        } catch (error) {
            return '';
        }
    }

    /**
     * 判斷是否為影片貼文
     * @param {string} html
     * @param {Object} metadata
     * @returns {boolean}
     */
    isVideoPost(html, metadata) {
        // 檢查 meta tags
        if (metadata.image && metadata.image.includes('.mp4')) {
            return true;
        }

        // 檢查 HTML 內容
        return html.includes('video') ||
               html.includes('VideoPlayer') ||
               html.includes('"is_video":true');
    }

    /**
     * 從 URL 提取使用者名稱
     * @param {string} url
     * @returns {string}
     */
    extractUsername(url) {
        const match = url.match(/instagram\.com\/([^\/]+)/);
        return match ? match[1] : '';
    }

    /**
     * 使用輕量 HTTP 請求提取 Instagram Reels 的 OG meta 資料
     * 取代舊版 Puppeteer 方式（30秒+ 超時問題）
     * @param {string} url - Instagram Reels URL
     * @returns {Promise<Object>}
     */
    async scrapeReelsWithPuppeteer(url) {
        const result = {
            metaDescription: null,
            metaTitle: null,
            metaUrl: null,
            authorName: null,
            caption: null,
            likes: null,
            comments: null,
        };

        try {
            tfd.sys('TFD-Instagram', `輕量 HTTP 提取 Reels 資料: ${url}`);

            const response = await axios.get(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                },
                maxRedirects: 3,
            });

            const html = typeof response.data === 'string' ? response.data : '';

            if (html) {
                // 用 regex 從 HTML 提取 OG meta 標籤
                result.metaDescription = this.extractMetaContent(html, 'og:description');
                result.metaTitle = this.extractMetaContent(html, 'og:title');
                result.metaUrl = this.extractMetaContent(html, 'og:url');

                // 從 description 解析詳細資訊
                if (result.metaDescription) {
                    const likesMatch = result.metaDescription.match(/([0-9,.KM]+)\s*(?:likes|個讚)/i);
                    if (likesMatch) result.likes = likesMatch[1];

                    const commentsMatch = result.metaDescription.match(/([0-9,.KM]+)\s*(?:comments|則留言)/i);
                    if (commentsMatch) result.comments = commentsMatch[1];

                    const captionMatch = result.metaDescription.match(/["""']([^"""']+)["""']/);
                    if (captionMatch) result.caption = captionMatch[1];

                    const authorMatch = result.metaDescription.match(/(?:comments|則留言)\s*[-–—]\s*([^\s(於@]+)/);
                    if (authorMatch) result.authorName = authorMatch[1].trim();
                }

                // 從 URL 提取作者
                if (!result.authorName && result.metaUrl) {
                    const urlMatch = result.metaUrl.match(/instagram\.com\/([^\/]+)\//);
                    if (urlMatch) result.authorName = urlMatch[1];
                }

                if (result.metaDescription || result.metaTitle) {
                    tfd.sys('TFD-Instagram', `HTTP 提取成功: 作者=${result.authorName || 'N/A'}`);
                } else {
                    tfd.sys('TFD-Instagram', `HTTP 回應無 OG 標籤（可能被登入牆阻擋）`);
                }
            }
        } catch (error) {
            tfd.sys('TFD-Instagram', `HTTP 提取失敗（${error.code || error.message}），跳過 metadata`);
        }

        return result;
    }

    /**
     * 從 HTML 中提取指定 OG meta 標籤的 content 值
     * @param {string} html - HTML 字串
     * @param {string} property - meta property 名稱
     * @returns {string|null}
     */
    extractMetaContent(html, property) {
        // 匹配 <meta property="og:xxx" content="..."> 或 content 在前的情況
        const regex = new RegExp(
            `<meta[^>]*(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*content=["']([^"']*)["']` +
            `|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
            'i'
        );
        const match = html.match(regex);
        return match ? (match[1] || match[2] || null) : null;
    }

    /**
     * 創建帶有 Metadata 的 Reels 格式化訊息（Embed 格式）
     * @param {Object} message - Discord 訊息物件
     * @param {string} convertedURL - 轉換後的 URL
     * @param {Object} reelsData - Reels metadata
     * @returns {Object} - 包含 embed 和 content 的物件
     */
    createReelsFormattedMessageWithMetadata(message, convertedURL, reelsData) {
        const embed = new EmbedBuilder()
            .setColor(0xE4405F)  // Instagram 品牌色
            .setTitle('🎬 Instagram Reels')
            .setURL(convertedURL)
            .setFooter({
                text: 'Instagram',
                iconURL: 'https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png'
            })
            .setTimestamp();

        // 設定作者資訊
        if (message && message.author) {
            const displayName = message.member?.displayName || message.author.globalName || message.author.username;
            embed.setAuthor({
                name: `${displayName} 分享了一條 IG Reels`,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            });
        }

        // 如果有 Reels 資料，顯示詳細資訊
        if (reelsData) {
            // Instagram 作者
            if (reelsData.authorName) {
                embed.addFields({
                    name: '作者',
                    value: `[@${reelsData.authorName}](https://www.instagram.com/${reelsData.authorName}/)`,
                    inline: true
                });
            }

            // 統計資訊
            if (reelsData.likes || reelsData.comments) {
                const stats = [];
                if (reelsData.likes) stats.push(`❤️ ${reelsData.likes}`);
                if (reelsData.comments) stats.push(`💬 ${reelsData.comments}`);

                embed.addFields({
                    name: '統計',
                    value: stats.join(' · '),
                    inline: true
                });
            }

            // 內文（截斷到 200 字）
            if (reelsData.caption) {
                const truncatedCaption = this.truncateCaption(reelsData.caption, 200);
                embed.setDescription(truncatedCaption);
            }
        }

        // 影片連結放在 embed 之後
        const content = `[影片](${convertedURL})`;

        return {
            embed: embed,
            content: content
        };
    }

    /**
     * 截斷內文到指定長度，加上 "...(詳全文)"
     * @param {string} text - 原始內文
     * @param {number} maxLength - 最大長度（預設 100）
     * @returns {string}
     */
    truncateCaption(text, maxLength = 100) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...(詳全文)';
    }
}

module.exports = InstagramExtractor;
