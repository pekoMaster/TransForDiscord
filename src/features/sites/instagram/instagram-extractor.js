/**
 * TFD 系統 - Instagram 提取器
 * 提取 Instagram 貼文和個人資料資訊
 */

const HTTPClient = require('../../../shared/http/http-client');
const DOMParser = require('../../../shared/html/dom-parser');
const TFDEmbedBuilder = require('../../../shared/discord/embed-builder');
const URLConverterLogger = require('../../../shared/logging/url-converter-logger');
const axios = require('axios');
const { EmbedBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { REPORT_BTN_PREFIX } = require('../../../shared/discord/spoiler-button-helper');
const tfd = require('../../../shared/logging/tfd-logger');

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
        const convertedURL = this.convertInstagramURL(originalURL);
        URLConverterLogger.logConversion('instagram', message, convertedURL);

        const embedData = await this.fetchInstagramEmbedData(originalURL, convertedURL, {
            contentType: 'post',
            shortcode: postId
        });

        if (embedData) {
            return this.createInstagramV2Response(embedData, message);
        }

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
        const convertedURL = this.convertInstagramURL(originalURL);
        URLConverterLogger.logConversion('instagram', message, convertedURL);

        const embedData = await this.fetchInstagramEmbedData(originalURL, convertedURL, {
            contentType: 'reel',
            shortcode: reelId
        });

        if (embedData) {
            return this.createInstagramV2Response(embedData, message);
        }

        return {
            success: true,
            siteName: 'instagram',
            contentType: 'url_conversion',
            convertedURL: convertedURL,
            redirect: true,
            redirectURL: convertedURL,
            data: { originalURL, convertedURL, reelId, type: 'reel' }
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
        const convertedURL = this.convertInstagramURL(originalURL);
        URLConverterLogger.logConversion('instagram', message, convertedURL);

        const embedData = await this.fetchInstagramEmbedData(originalURL, convertedURL, {
            contentType: 'story',
            shortcode: storyId,
            username
        });

        if (embedData) {
            return this.createInstagramV2Response(embedData, message);
        }

        const storyMessage = this.createStoriesFormattedMessage(message, convertedURL);
        return {
            success: true,
            siteName: 'instagram',
            contentType: 'story_formatted',
            convertedURL: convertedURL,
            deleteOriginal: true,
            embed: storyMessage.embed,
            content: storyMessage.content,
            data: { originalURL, convertedURL, username, storyId, type: 'story' }
        };
    }
    async fetchInstagramEmbedData(originalURL, convertedURL, options = {}) {
        const contentType = options.contentType || 'post';
        const shortcode = options.shortcode || null;
        const originalMeta = await this.fetchOpenGraphMetadata(originalURL);
        const proxyMeta = await this.fetchOpenGraphMetadata(convertedURL);
        const title = originalMeta.title || proxyMeta.title || null;
        const description = originalMeta.description || proxyMeta.description || null;
        const imageUrl = originalMeta.image || proxyMeta.image || null;
        let videoUrl = proxyMeta.video || originalMeta.video || null;
        if (!videoUrl && contentType === 'reel' && shortcode) {
            videoUrl = 'https://vxinstagram.com/offload/' + shortcode + '/0.mp4';
        }
        const authorName = this.extractAuthorFromInstagramMeta(description, title, originalURL) || options.username || null;
        const caption = this.extractCaptionFromInstagramMeta(description, title);
        const stats = this.extractStatsFromInstagramMeta(description);
        if (!title && !description && !imageUrl && !videoUrl) return null;
        return { originalURL, convertedURL, contentType, shortcode, title, description, authorName, caption, imageUrl, videoUrl, stats };
    }

    async fetchOpenGraphMetadata(url) {
        const empty = { title: null, description: null, image: null, video: null };
        try {
            const response = await axios.get(url, {
                timeout: 8000,
                maxRedirects: 3,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
                }
            });
            const html = typeof response.data === 'string' ? response.data : '';
            if (!html) return empty;
            return {
                title: this.extractMetaContent(html, 'og:title'),
                description: this.extractMetaContent(html, 'og:description'),
                image: this.extractMetaContent(html, 'og:image'),
                video: this.extractMetaContent(html, 'og:video') || this.extractMetaContent(html, 'og:video:url') || this.extractMetaContent(html, 'twitter:player:stream')
            };
        } catch (error) {
            tfd.sys('TFD-Instagram', 'OG metadata fetch failed (' + (error.code || error.message) + '): ' + url);
            return empty;
        }
    }

    createInstagramV2Response(embedData, message = null) {
        return {
            success: true,
            siteName: 'instagram',
            contentType: 'instagram_v2',
            isV2: true,
            v2Container: this.buildInstagramV2Container(embedData, message),
            originalURL: embedData.originalURL,
            convertedURL: embedData.convertedURL,
            data: embedData
        };
    }

    buildInstagramV2Container(embedData, message = null) {
        const container = new ContainerBuilder().setAccentColor(0xE4405F);
        const typeLabel = { post: 'Instagram 貼文', reel: 'Instagram Reels', story: 'Instagram Story' }[embedData.contentType] || 'Instagram';
        const lines = ['**' + typeLabel + '**'];
        if (embedData.authorName) lines.push('[@' + embedData.authorName + '](https://www.instagram.com/' + embedData.authorName + '/)');
        const caption = this.truncateCaption(embedData.caption || embedData.description || embedData.title || '', 900);
        if (caption) lines.push(caption);
        let linkLine = '[原網址](' + embedData.originalURL + ')';
        if (embedData.convertedURL && embedData.convertedURL !== embedData.originalURL) linkLine += '  [轉換連結](' + embedData.convertedURL + ')';
        lines.push(linkLine);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.filter(Boolean).join('\n')));
        const galleryItems = [];
        const seen = new Set();
        const addMedia = (url, label) => {
            if (!url) return;
            const cleanUrl = this.decodeHtmlEntities(url);
            if (seen.has(cleanUrl)) return;
            seen.add(cleanUrl);
            galleryItems.push(new MediaGalleryItemBuilder().setURL(cleanUrl).setDescription(label));
        };
        addMedia(embedData.videoUrl, '影片');
        addMedia(embedData.imageUrl, '圖片');
        if (galleryItems.length > 0) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(...galleryItems));
        const stats = [];
        if (embedData.stats && embedData.stats.likes) stats.push('likes ' + embedData.stats.likes);
        if (embedData.stats && embedData.stats.comments) stats.push('comments ' + embedData.stats.comments);
        const footerText = stats.length > 0 ? '-# ' + stats.join('  ') + ' | Instagram | Peko Embed' : '-# Instagram | Peko Embed';
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ig_reload_' + embedData.originalURL).setLabel('重整').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(REPORT_BTN_PREFIX + Date.now()).setLabel('回報').setStyle(ButtonStyle.Secondary)
        ));
        return container;
    }

    extractAuthorFromInstagramMeta(description, title, url) {
        const desc = this.decodeHtmlEntities(description || '');
        const titleText = this.decodeHtmlEntities(title || '');
        let m = desc.match(/comments?\s*-\s*([A-Za-z0-9._]+)\s+(?:on|於)\s+/i);
        if (m) return m[1];
        m = titleText.match(/@([A-Za-z0-9._]+)/);
        if (m) return m[1];

        try {
            const parts = new URL(url).pathname.split('/').filter(Boolean);
            const first = parts.find(part => !['p', 'reel', 'reels', 'stories'].includes(part.toLowerCase()));
            return first || null;
        } catch (_) {
            m = String(url || '').match(/instagram\.com\/([^/]+)\//i);
            if (!m) return null;
            return ['p', 'reel', 'reels', 'stories'].includes(m[1].toLowerCase()) ? null : m[1];
        }
    }

    extractCaptionFromInstagramMeta(description, title) {
        const desc = this.decodeHtmlEntities(description || '');
        const titleText = this.decodeHtmlEntities(title || '');
        let text = desc || titleText || '';
        const marker = ' : "';
        let start = text.indexOf(marker);
        if (start >= 0) {
            start += marker.length;
            const end = text.indexOf('"', start);
            if (end > start) return text.slice(start, end).trim();
        }
        start = titleText.indexOf(': "');
        if (start >= 0) {
            start += 3;
            const end = titleText.indexOf('"', start);
            if (end > start) return titleText.slice(start, end).trim();
        }
        return text.trim();
    }

    extractStatsFromInstagramMeta(description) {
        const desc = this.decodeHtmlEntities(description || '');
        const likesMatch = desc.match(/([0-9,.KM]+)\s*likes/i) || desc.match(/([0-9,.KM]+)\s*個讚/i);
        const commentsMatch = desc.match(/([0-9,.KM]+)\s*comments/i) || desc.match(/([0-9,.KM]+)\s*則留言/i);
        return { likes: likesMatch ? likesMatch[1] : null, comments: commentsMatch ? commentsMatch[1] : null };
    }

    decodeHtmlEntities(value) {
        if (!value || typeof value !== 'string') return value || null;
        return value
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
            .trim();
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
        return match ? this.decodeHtmlEntities(match[1] || match[2] || null) : null;
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
