/**
 * TFD 系統 - URL 匹配器
 * URL 解析和網站類型識別
 */

const patterns = require('./patterns');

class URLMatcher {
    constructor() {
        this.patterns = patterns;
    }

    /**
     * 從文字中提取所有 URL
     * 自動過濾被 Markdown 格式包裹的 URL：
     * - <URL> （尖括號）
     * - `URL` （單個反引號）
     * - ```URL``` （三個反引號）
     * 並清理不必要的查詢參數
     * @param {string} text
     * @returns {string[]} URL 陣列
     */
    extractURLs(text) {
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        const allUrls = text.match(urlRegex) || [];

        // 過濾被特定格式包裹的 URL 和 Discord 訊息連結
        const filteredUrls = allUrls.filter(url => {
            // 過濾 Markdown 包裹的 URL
            if (this.isUrlWrappedInMarkdown(text, url)) {
                return false;
            }

            // 過濾 Discord 訊息連結（不處理）
            if (this.isDiscordMessageLink(url)) {
                return false;
            }

            return true;
        });

        // 清理 URL 參數
        return filteredUrls.map(url => this.cleanURLParameters(url));
    }

    /**
     * 檢查是否為 Discord 訊息連結
     * @param {string} url
     * @returns {boolean}
     */
    isDiscordMessageLink(url) {
        // Discord 訊息連結格式：
        // https://discord.com/channels/{guildId}/{channelId}/{messageId}
        // https://ptb.discord.com/channels/...
        // https://canary.discord.com/channels/...
        const discordLinkPattern = /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+\/\d+/i;
        return discordLinkPattern.test(url);
    }

    /**
     * 清理 URL 中不必要的查詢參數
     * @param {string} url
     * @returns {string}
     */
    cleanURLParameters(url) {
        try {
            // 特殊處理：某些網站需要保留完整 URL（如 Facebook）
            const keepFullUrl = [
                'facebook.com',
                'bahamut.com',
                'mobile01.com',
                'pornhub.com'  // Pornhub 使用查詢參數 (viewkey)
            ];

            // 檢查是否為需要保留完整 URL 的網站
            if (keepFullUrl.some(site => url.includes(site))) {
                return url;
            }

            // 移除查詢參數和片段標識符
            const urlObj = new URL(url);
            return urlObj.origin + urlObj.pathname;

        } catch (error) {
            // URL 解析失敗，返回原始 URL
            return url;
        }
    }

    /**
     * 檢查 URL 是否被 Markdown 格式包裹
     * @param {string} text 完整文字
     * @param {string} url 要檢查的 URL
     * @returns {boolean} true 表示被包裹（應忽略）
     */
    isUrlWrappedInMarkdown(text, url) {
        // 找出 URL 在文字中的位置
        const urlIndex = text.indexOf(url);
        if (urlIndex === -1) return false;

        const beforeUrl = text.substring(0, urlIndex);
        const afterUrl = text.substring(urlIndex + url.length);

        // 檢查 1: <URL> 尖括號包裹
        if (beforeUrl.endsWith('<') && afterUrl.startsWith('>')) {
            return true;
        }

        // 檢查 2: ```URL``` 三個反引號（同一行）
        if (beforeUrl.endsWith('```') && afterUrl.startsWith('```')) {
            return true;
        }

        // 檢查 3: 多行 code block（``` 換行 ... URL ... 換行 ```）
        if (/```[^\n]*\n\s*$/.test(beforeUrl) && /^\s*\n\s*```/.test(afterUrl)) {
            return true;
        }

        // 檢查 4: `URL` 單個反引號（不是三個反引號的一部分）
        const endsWithSingleBacktick = beforeUrl.endsWith('`') && !beforeUrl.endsWith('``');
        const startsWithSingleBacktick = afterUrl.startsWith('`') && !afterUrl.startsWith('``');
        if (endsWithSingleBacktick && startsWithSingleBacktick) {
            return true;
        }

        return false;
    }

    /**
     * 識別 URL 的網站類型和詳細資訊
     * @param {string} url
     * @returns {Object|null} 匹配結果
     */
    matchURL(url) {
        // 移除 URL 末尾的查詢參數和片段
        const cleanURL = url.split('?')[0].split('#')[0];

        // 遍歷所有模式
        for (const [siteName, sitePatterns] of Object.entries(this.patterns)) {
            for (const [patternName, pattern] of Object.entries(sitePatterns)) {
                // 對於某些網站（如 Facebook、Bahamut、Mobile01、Pornhub），需要保留查詢參數進行匹配
                const urlToMatch = ((siteName === 'facebook' || siteName === 'bahamut' || siteName === 'mobile01' || siteName === 'pornhub') && url.includes('?')) ? url : cleanURL;
                const match = urlToMatch.match(pattern);
                if (match) {
                    return {
                        originalURL: url,
                        cleanURL: cleanURL,
                        siteName: siteName,
                        patternName: patternName,
                        matches: match,
                        extractedData: this.extractData(siteName, patternName, match)
                    };
                }
            }
        }

        return null;
    }

    /**
     * 從匹配結果中提取結構化資料
     * @param {string} siteName
     * @param {string} patternName
     * @param {Array} matches
     * @returns {Object}
     */
    extractData(siteName, patternName, matches) {
        const extractors = {
            twitter: {
                tweet: (m) => ({ username: m[1] || null, tweetId: m[2] }), // 修正：m[1] 可能是 undefined
                profile: (m) => ({ username: m[1] })
            },
            instagram: {
                post: (m) => ({ postId: m[1] }),
                reel: (m) => ({ reelId: m[1] }),
                story: (m) => ({ username: m[1], storyId: m[2] })
            },
            threads: {
                post: (m) => ({ username: m[1], postId: m[2] }),
                profile: (m) => ({ username: m[1] })
            },
            // tiktok, plurk, bluesky: 已移除 (2026-04-12)
            ptt: {
                article: (m) => ({ board: m[1], timestamp: m[2], hash: m[3] }),
                board: (m) => ({ board: m[1] })
            },
            pttweb: {
                article: (m) => ({ board: m[1], timestamp: m[2], hash: m[3] })
            },
            bahamut: {
                forum: (m) => ({ bsn: m[1], snA: m[2] }),
                home: (m) => ({ sn: m[1] }),
                creationDetail: (m) => ({ sn: m[1] }),
                gnn: (m) => ({ sn: m[1] })
            },
            // dcard: 已移除 (2026-04-12)
            pixiv: {
                artwork: (m) => ({ artworkId: m[1] }),
                user: (m) => ({ userId: m[1] }),
                novel: (m) => ({ novelId: m[1] })
            },
            // iwara: 已移除 (2026-04-12)
            bilibili: {
                video: (m) => ({ bvid: m[1] }),
                column: (m) => ({ cvid: m[1] }),
                dynamic: (m) => ({ dynamicId: m[1] }),
                space: (m) => ({ userId: m[1] }),
                live: (m) => ({ roomId: m[1] }),
                shortUrl: (m) => ({ shortCode: m[1] }),
                mobileShortUrl: (m) => ({ bvid: m[1] })
            },
            facebook: {
                post: (m) => ({ postId: m[1] }),
                video: (m) => ({ videoId: m[1] }),
                watch: (m) => ({ videoId: m[1] }),
                reel: (m) => ({ reelId: m[1] }),
                photo: (m) => ({ photoId: m[1] }),
                photoNew: (m) => ({ photoId: m[1] }),
                share: (m) => ({ shareId: m[1] }),
                shareVideo: (m) => ({ shareVideoId: m[1] }),
                shareR: (m) => ({ shareRId: m[1] }),
                groupsPost: (m) => ({ groupId: m[1], postId: m[2] }),
                groupsPermalink: (m) => ({ groupId: m[1], permalinkId: m[2] }),
                groups: (m) => ({ groupId: m[1], query: m[2] || null }),
                generic: (m) => ({ path: m[1] })
            },
            pchome: {
                product: (m) => ({ productId: m[1] }),
                store: (m) => ({ storeId: m[1] })
            },
            // ehentai, nhentai: 已移除 (2026-04-12)
            linetoday: {
                article: (m) => ({ language: m[1], articleId: m[2] })
            },
            storm: {
                article: (m) => ({ category: m[1], articleId: m[2] })
            },
            msn: {
                article: (m) => ({ locale: m[1], articleId: m[2] })
            },
            udn: {
                article: (m) => ({ storyId: m[1], articleId: m[2] }),
                ampArticle: (m) => ({ storyId: m[1], articleId: m[2] }),
                video: (m) => ({ videoId: m[1] })
            },
            cts: {
                article: (m) => ({ category: m[1], yearMonth: m[2], articleId: m[3] })
            },
            xfastest: {
                article: (m) => ({ category: m[1], articleId: m[2], slug: m[3] })
            },
            mobile01: {
                topic: (m) => ({ forumId: m[1], topicId: m[2], page: m[3] || null })
            },
            '4gamers': {
                shortUrl: (m) => ({ shortCode: m[1] }),
                news: (m) => ({ newsId: m[1] })
            },
            pornhub: {
                video: (m) => ({ viewkey: m[1] }),
                videoNew: (m) => ({ videoId: m[1] }),
                embed: (m) => ({ videoId: m[1] })
            },
            pokewiki: {
                page: (m) => ({ pageName: m[1] })
            },
            hololiveshop: {
                product: (m) => ({ productSlug: m[1] })
            },
            youtube: {
                live: (m) => ({ videoId: m[1] })
            }
        };

        const siteExtractors = extractors[siteName];
        if (siteExtractors && siteExtractors[patternName]) {
            return siteExtractors[patternName](matches);
        }

        return {};
    }

    /**
     * 批次處理多個 URL
     * @param {string[]} urls
     * @returns {Object[]} 匹配結果陣列
     */
    matchMultipleURLs(urls) {
        return urls.map(url => this.matchURL(url)).filter(result => result !== null);
    }

    /**
     * 檢查是否為支援的網站
     * @param {string} url
     * @returns {boolean}
     */
    isSupported(url) {
        return this.matchURL(url) !== null;
    }

    /**
     * 取得支援的網站清單
     * @returns {string[]}
     */
    getSupportedSites() {
        return Object.keys(this.patterns);
    }
}

module.exports = URLMatcher;