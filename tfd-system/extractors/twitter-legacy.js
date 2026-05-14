/**
 * TFD 系統 - Twitter/X 提取器
 * 提取 Twitter/X 推文和個人資料資訊
 */

const HTTPClient = require('../utils/http-client');
const DOMParser = require('../utils/dom-parser');
const TFDEmbedBuilder = require('../utils/embed-builder');
const tfd = require('../../utils/tfd-logger');

class TwitterExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.domParser = new DOMParser();
        this.embedBuilder = new TFDEmbedBuilder();
        this.name = 'Twitter/X';
    }

    /**
     * 處理 Twitter URL
     * @param {Object} matchResult
     * @returns {Promise<Object>}
     */
    async extract(matchResult) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            switch (patternName) {
                case 'tweet':
                    return await this.extractTweet(extractedData.tweetId, originalURL);
                case 'profile':
                    return await this.extractProfile(extractedData.username, originalURL);
                default:
                    throw new Error(`不支援的 Twitter 模式: ${patternName}`);
            }
        } catch (error) {
            tfd.sysError('TFD-Twitter', `提取失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 提取推文資訊
     * @param {string} tweetId
     * @param {string} originalURL
     * @returns {Promise<Object>}
     */
    async extractTweet(tweetId, originalURL) {
        // 使用多種方法嘗試取得推文資料
        let tweetData = null;

        // 方法1: 嘗試使用 fxtwitter.com (nitter替代)
        try {
            tweetData = await this.fetchFromFxTwitter(tweetId);
        } catch (error) {
            tfd.sys('TFD-Twitter', `FxTwitter 失敗: ${error.message}`);
        }

        // 方法2: 嘗試直接解析 Twitter HTML
        if (!tweetData) {
            try {
                tweetData = await this.fetchFromTwitterHTML(originalURL);
            } catch (error) {
                tfd.sys('TFD-Twitter', `HTML 解析失敗: ${error.message}`);
            }
        }

        // 方法3: 使用 fixupx.com
        if (!tweetData) {
            try {
                const fixupURL = originalURL.replace(/https?:\/\/(twitter\.com|x\.com)/, 'https://fixupx.com');
                tweetData = await this.fetchFromTwitterHTML(fixupURL);
            } catch (error) {
                tfd.sys('TFD-Twitter', `FixupX 失敗: ${error.message}`);
            }
        }

        if (!tweetData) {
            throw new Error('無法取得推文資料');
        }

        return this.createTweetResponse(tweetData, originalURL);
    }

    /**
     * 從 FxTwitter 取得推文資料
     * @param {string} tweetId
     * @returns {Promise<Object>}
     */
    async fetchFromFxTwitter(tweetId) {
        const apiURL = `https://api.fxtwitter.com/twitter/status/${tweetId}`;
        const data = await this.httpClient.fetchJSON(apiURL);

        // 只記錄關鍵資訊，避免輸出完整 API 回應
        tfd.sys('TFD-Twitter', `FxTwitter API 回應: tweet=${data?.tweet ? 'OK' : 'null'}, author=${data?.tweet?.author?.screen_name || 'N/A'}`);

        if (!data || !data.tweet) {
            throw new Error('FxTwitter API 回應無效');
        }

        const tweet = data.tweet;

        // 處理媒體數據，確保安全
        let mediaArray = [];
        if (tweet.media) {
            // FxTwitter API 的 media 結構是 {all: [], photos: [], videos: []}
            const allMedia = tweet.media.all || [];
            const photosMedia = tweet.media.photos || [];
            const videosMedia = tweet.media.videos || [];

            // 合併所有媒體
            const combinedMedia = [...allMedia, ...photosMedia, ...videosMedia];

            if (combinedMedia.length > 0) {
                mediaArray = combinedMedia.map(media => ({
                    type: media.type || 'photo',
                    url: media.url || null,
                    preview_url: media.url || null,
                    width: media.width || null,
                    height: media.height || null
                })).filter(media => media.url); // 過濾掉沒有URL的媒體
            }
        }

        return {
            text: tweet.text || '',
            author: {
                name: tweet.author?.name || '',
                username: tweet.author?.screen_name || '',
                avatar: tweet.author?.avatar_url || ''
            },
            createdAt: tweet.created_at || '',
            stats: {
                likes: tweet.likes || 0,
                retweets: tweet.retweets || 0,
                replies: tweet.replies || 0
            },
            media: mediaArray,
            isRetweet: tweet.text?.startsWith('RT @') || false
        };
    }

    /**
     * 從 Twitter HTML 解析推文資料
     * @param {string} url
     * @returns {Promise<Object>}
     */
    async fetchFromTwitterHTML(url) {
        const html = await this.httpClient.fetchHTML(url);
        if (!html) {
            throw new Error('無法取得 HTML 內容');
        }

        const metadata = this.domParser.extractMetadata(html);

        return {
            text: metadata.description || '',
            author: {
                name: this.extractAuthorName(metadata),
                username: this.extractUsername(url),
                avatar: metadata.image || ''
            },
            createdAt: metadata.publishedTime || '',
            stats: {
                likes: 0,
                retweets: 0,
                replies: 0
            },
            media: metadata.image ? [{ type: 'photo', url: metadata.image }] : [],
            isRetweet: metadata.description?.includes('RT @') || false
        };
    }

    /**
     * 提取個人資料資訊
     * @param {string} username
     * @param {string} originalURL
     * @returns {Promise<Object>}
     */
    async extractProfile(username, originalURL) {
        const html = await this.httpClient.fetchHTML(originalURL);
        if (!html) {
            throw new Error('無法取得個人資料頁面');
        }

        const metadata = this.domParser.extractMetadata(html);

        const profileData = {
            username: username,
            displayName: metadata.title || username,
            description: metadata.description || '',
            avatar: metadata.image || '',
            banner: '',
            stats: {
                followers: 0,
                following: 0,
                tweets: 0
            },
            verified: false,
            joinDate: ''
        };

        return this.createProfileResponse(profileData, originalURL);
    }

    /**
     * 建立推文回應
     * @param {Object} tweetData
     * @param {string} originalURL
     * @returns {Object}
     */
    createTweetResponse(tweetData, originalURL) {
        // 檢測是否有影片媒體
        const videoMedia = this.getVideoMedia(tweetData.media);
        const imageMedia = this.getImageMedia(tweetData.media);

        const embed = this.embedBuilder.createSocialMediaEmbed({
            title: tweetData.isRetweet ? '🔄 轉推' : '🐦 推文',
            description: this.formatTweetText(tweetData.text),
            url: originalURL,
            color: this.embedBuilder.getSiteColor('twitter'),
            author: {
                name: `${tweetData.author.name} (@${tweetData.author.username})`,
                iconURL: tweetData.author.avatar,
                url: `https://twitter.com/${tweetData.author.username}`
            },
            // 如果有影片，不在 embed 中顯示圖片；只有純圖片時才顯示
            image: videoMedia ? null : this.getFirstMediaURL(imageMedia),
            timestamp: tweetData.createdAt,
            stats: tweetData.stats,
            footer: {
                text: 'Twitter/X',
                iconURL: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
            }
        });

        const result = {
            success: true,
            embed: embed,
            siteName: 'twitter',
            contentType: 'tweet',
            data: tweetData
        };

        // 如果有影片，加入外部連結資訊
        if (videoMedia && videoMedia.length > 0) {
            result.hasVideo = true;
            result.videoLinks = videoMedia.map(video => ({
                url: video.url,
                type: video.type
            }));

            tfd.sys('TFD-Twitter', `檢測到影片媒體: ${JSON.stringify(result.videoLinks)}`);
        }

        tfd.sys('TFD-Twitter', `建立回應: success=${result.success}, hasEmbed=${!!result.embed}, siteName=${result.siteName}, hasVideo=${result.hasVideo || false}`);

        return result;
    }

    /**
     * 建立個人資料回應
     * @param {Object} profileData
     * @param {string} originalURL
     * @returns {Object}
     */
    createProfileResponse(profileData, originalURL) {
        const embed = this.embedBuilder.createBasicEmbed({
            title: `${profileData.displayName} (@${profileData.username})`,
            description: profileData.description,
            url: originalURL,
            color: this.embedBuilder.getSiteColor('twitter'),
            thumbnail: profileData.avatar,
            image: profileData.banner,
            footer: {
                text: 'Twitter/X 個人資料',
                iconURL: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
            }
        });

        // 添加統計欄位
        if (profileData.stats.followers > 0 || profileData.stats.following > 0) {
            embed.addFields([
                {
                    name: '👥 跟隨者',
                    value: this.embedBuilder.formatNumber(profileData.stats.followers),
                    inline: true
                },
                {
                    name: '➡️ 跟隨中',
                    value: this.embedBuilder.formatNumber(profileData.stats.following),
                    inline: true
                },
                {
                    name: '📝 推文',
                    value: this.embedBuilder.formatNumber(profileData.stats.tweets),
                    inline: true
                }
            ]);
        }

        return {
            success: true,
            embed: embed,
            siteName: 'twitter',
            contentType: 'profile',
            data: profileData
        };
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
            embed: this.embedBuilder.createErrorEmbed(`Twitter 取得失敗: ${message}`, url),
            siteName: 'twitter'
        };
    }

    /**
     * 格式化推文文字
     * @param {string} text
     * @returns {string}
     */
    formatTweetText(text) {
        if (!text) return '';

        // 移除多餘的空白和換行
        return text.replace(/\s+/g, ' ').trim();
    }

    /**
     * 取得第一個媒體 URL
     * @param {Array} media
     * @returns {string|null}
     */
    getFirstMediaURL(media) {
        if (!media || !Array.isArray(media) || media.length === 0) {
            return null;
        }

        const firstMedia = media[0];
        if (!firstMedia) {
            return null;
        }

        // 嘗試多種可能的 URL 欄位
        return firstMedia.url ||
               firstMedia.media_url_https ||
               firstMedia.media_url ||
               firstMedia.preview_url ||
               null;
    }

    /**
     * 取得影片媒體
     * @param {Array} media
     * @returns {Array}
     */
    getVideoMedia(media) {
        if (!media || !Array.isArray(media)) {
            return [];
        }

        return media.filter(item => {
            if (!item) return false;

            // 檢查類型
            if (item.type === 'video' || item.type === 'animated_gif') {
                return true;
            }

            // 檢查 URL 是否包含影片格式
            const url = item.url || item.media_url_https || item.media_url || '';
            return url.includes('.mp4') || url.includes('.mov') || url.includes('.webm');
        });
    }

    /**
     * 取得圖片媒體
     * @param {Array} media
     * @returns {Array}
     */
    getImageMedia(media) {
        if (!media || !Array.isArray(media)) {
            return [];
        }

        return media.filter(item => {
            if (!item) return false;

            // 檢查類型
            if (item.type === 'photo' || item.type === 'image') {
                return true;
            }

            // 檢查 URL 是否包含圖片格式
            const url = item.url || item.media_url_https || item.media_url || '';
            return url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.gif');
        });
    }

    /**
     * 從元資料提取作者名稱
     * @param {Object} metadata
     * @returns {string}
     */
    extractAuthorName(metadata) {
        const title = metadata.title || '';
        const match = title.match(/^(.+?)\s+on\s+(?:Twitter|X):/);
        return match ? match[1] : metadata.author || '';
    }

    /**
     * 從 URL 提取使用者名稱
     * @param {string} url
     * @returns {string}
     */
    extractUsername(url) {
        const match = url.match(/https?:\/\/(?:twitter\.com|x\.com)\/([^\/]+)/);
        return match ? match[1] : '';
    }
}

module.exports = TwitterExtractor;