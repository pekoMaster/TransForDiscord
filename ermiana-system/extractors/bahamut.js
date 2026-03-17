/**
 * Ermiana 系統 - 巴哈姆特提取器
 * 提取巴哈姆特論壇文章資訊，支援年齡限制內容
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');
const BahamutAuth = require('../../utils/bahamut-auth');
const URLConverterLogger = require('../utils/url-converter-logger');

class BahamutExtractor {
    constructor() {
        this.name = 'Bahamut';
        this.auth = new BahamutAuth();
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
            'Referer': 'https://forum.gamer.com.tw/'
        };
    }

    /**
     * 處理巴哈姆特 URL
     * @param {Object} matchResult
     * @param {Object} message Discord 訊息物件 (可選)
     * @param {boolean} isSpoiler 是否為防爆雷內容
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null, isSpoiler = false) {
        const { extractedData, originalURL } = matchResult;

        try {
            console.log(`[Bahamut] 開始處理: ${originalURL}`);

            // 先嘗試無認證請求
            let response = await this.makeRequest(originalURL, false);
            let needsAuth = false;

            if (response.data) {
                const $ = cheerio.load(response.data);

                // 檢查是否需要認證
                if (this.isAgeRestrictionPage($)) {
                    console.log('[Bahamut] 檢測到年齡限制，嘗試使用認證...');
                    needsAuth = true;
                } else {
                    // 無需認證，直接處理
                    const articleData = this.parseArticleData($, originalURL);
                    return this.createSuccessResponse(articleData, false, originalURL, message, isSpoiler);
                }
            }

            // 需要認證或第一次請求失敗
            if (needsAuth || !response.data) {
                console.log('[Bahamut] 使用認證模式請求...');
                response = await this.makeRequest(originalURL, true);

                if (response.data) {
                    const $ = cheerio.load(response.data);

                    // 再次檢查是否仍有限制
                    if (this.isAgeRestrictionPage($)) {
                        throw new Error('即使使用認證仍無法訪問該內容');
                    }

                    const articleData = this.parseArticleData($, originalURL);
                    return this.createSuccessResponse(articleData, true, originalURL, message, isSpoiler);
                }
            }

            throw new Error('無法取得頁面內容');

        } catch (error) {
            console.error(`[Bahamut] 處理失敗: ${error.message}`);
            URLConverterLogger.logError('bahamut', originalURL, error.message);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 發送 HTTP 請求
     * @param {string} url
     * @param {boolean} useAuth 是否使用認證
     * @returns {Promise<Object>}
     */
    async makeRequest(url, useAuth = false) {
        try {
            const headers = { ...this.headers };

            if (useAuth) {
                const cookieString = await this.auth.getCookieString();
                headers.Cookie = cookieString;
                console.log('[Bahamut] 使用認證 Cookie 請求');
            }

            const response = await axios.get(url, {
                headers: headers,
                timeout: 15000,
                validateStatus: status => status < 500
            });

            return {
                success: true,
                data: response.data,
                status: response.status
            };

        } catch (error) {
            console.error(`[Bahamut] 請求失敗: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 檢查是否為年齡限制頁面
     */
    isAgeRestrictionPage($) {
        const title = $('title').text();

        // 檢查明確的年齡限制關鍵字
        const ageRestrictKeywords = [
            '兒少保護警示',
            '年齡確認',
            '內容警告',
            '限制級內容',
            'age restriction',
            'age verification'
        ];

        // 檢查標題
        for (const keyword of ageRestrictKeywords) {
            if (title.toLowerCase().includes(keyword.toLowerCase())) {
                return true;
            }
        }

        // 檢查主要內容區域
        const mainContentSelector = [
            '.BH-rbox .content',
            '.c-article__content',
            '.msgcontext',
            '.forum-content',
            '#main'
        ];

        for (const selector of mainContentSelector) {
            const element = $(selector);
            if (element.length > 0) {
                const content = element.text();
                for (const keyword of ageRestrictKeywords) {
                    if (content.toLowerCase().includes(keyword.toLowerCase())) {
                        return true;
                    }
                }
            }
        }

        // 檢查明確的警告類別
        const warningSelectors = [
            '.age-warning',
            '.content-warning',
            '.restriction-warning',
            '.adult-content-warning',
            '.warning[class*="age"]'
        ];

        for (const selector of warningSelectors) {
            if ($(selector).length > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * 解析文章資料
     */
    parseArticleData($, url) {
        // 標題 - 只取文章標題，移除版面資訊
        let title = $('meta[property="og:title"]').attr('content') || $('title').text() || '巴哈姆特文章';
        title = title.replace(/ @.*哈啦板.*/, '').replace(/ - 巴哈姆特$/, '').trim();

        // 文章內容 - 只取第一段文章內容
        let description = '';
        const contentSelectors = [
            '.c-article__content',
            '.msgcontext',
            '.BH-rbox .content'
        ];

        for (const selector of contentSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                description = element.first().text().trim();
                break;
            }
        }

        if (!description) {
            description = $('meta[property="og:description"]').attr('content') || '無法取得文章內容';
        }

        // 限制內容長度為100個中文字
        if (description.length > 100) {
            description = description.substring(0, 100) + '...(詳見原文)';
        }

        // 作者資訊 - 多重方法提取
        let authorName = '';

        // 方法1: 從 JSON-LD 結構中提取
        try {
            const jsonLD = $('script[type="application/ld+json"]').html();
            if (jsonLD) {
                const parsed = JSON.parse(jsonLD);
                if (Array.isArray(parsed)) {
                    const article = parsed.find(item => item['@type'] === 'Article');
                    if (article && article.author && article.author.name) {
                        authorName = article.author.name;
                    }
                }
            }
        } catch (e) {
            console.log('[Bahamut] JSON-LD 解析失敗');
        }

        // 方法2: 從用戶名連結提取
        if (!authorName) {
            const usernameElement = $('.username').first();
            if (usernameElement.length > 0) {
                const href = usernameElement.attr('href');
                if (href) {
                    const match = href.match(/gamer\.com\.tw\/([^\/\?]+)/);
                    if (match) {
                        authorName = match[1];
                    }
                }
            }
        }

        // 方法3: 從 .userid 選擇器提取
        if (!authorName) {
            const useridElement = $('.userid').first();
            if (useridElement.length > 0) {
                authorName = useridElement.text().trim();
            }
        }

        // 生成頭像 URL
        let avatarURL = null;
        if (authorName) {
            const firstChar = authorName.charAt(0).toLowerCase();
            const secondChar = authorName.length > 1 ? authorName.charAt(1).toLowerCase() : firstChar;
            avatarURL = `https://avatar2.bahamut.com.tw/avataruserpic/${firstChar}/${secondChar}/${authorName}/${authorName}.png`;
        }

        // 生成小屋連結
        const homeURL = authorName ? `https://home.gamer.com.tw/${authorName}` : null;

        // 推噓數統計
        let likeCount = 0;
        let dislikeCount = 0;

        // 從樓主的推噓資訊提取
        const postGP = $('.postgp span').first().text().trim();
        const postBP = $('.postbp span').first().text().trim();

        if (postGP && postGP !== '-' && !isNaN(parseInt(postGP))) {
            likeCount = parseInt(postGP);
        }

        if (postBP && postBP !== '-' && !isNaN(parseInt(postBP))) {
            dislikeCount = parseInt(postBP);
        }

        // 圖片提取 - 取得文章中的第一張圖片
        let firstImageURL = null;

        // 方法1: 從 JSON-LD 結構中提取
        try {
            const jsonLD = $('script[type="application/ld+json"]').html();
            if (jsonLD) {
                const parsed = JSON.parse(jsonLD);
                if (Array.isArray(parsed)) {
                    const article = parsed.find(item => item['@type'] === 'Article');
                    if (article && article.image && Array.isArray(article.image) && article.image.length > 0) {
                        firstImageURL = article.image[0];
                    }
                }
            }
        } catch (e) {
            console.log('[Bahamut] JSON-LD 圖片解析失敗');
        }

        // 方法2: 從文章內容中找圖片
        if (!firstImageURL) {
            const articleImages = $('.c-article__content img');
            if (articleImages.length > 0) {
                const firstImg = articleImages.first();
                firstImageURL = firstImg.attr('src') || firstImg.attr('data-src');
            }
        }

        // 方法3: 從 OG image 提取
        if (!firstImageURL) {
            firstImageURL = $('meta[property="og:image"]').attr('content');
        }

        // URL 參數
        const urlMatch = url.match(/bsn=(\d+)&snA=(\d+)/);
        const bsn = urlMatch ? urlMatch[1] : '';
        const snA = urlMatch ? urlMatch[2] : '';

        return {
            title,
            description,
            authorName: authorName || '未知使用者',
            avatarURL,
            homeURL,
            likeCount,
            dislikeCount,
            firstImageURL,
            url,
            bsn,
            snA
        };
    }

    /**
     * 建立成功回應
     */
    createSuccessResponse(data, authUsed, originalURL, message, isSpoiler = false) {
        console.log(`[Bahamut] 成功提取文章: ${data.title}`);

        // 記錄網址轉換
        if (message) {
            URLConverterLogger.logConversion('bahamut', originalURL, message);
        }

        return {
            success: true,
            embed: this.createArticleEmbed(data, isSpoiler),
            siteName: 'bahamut',
            contentType: 'forum_post',
            data: data,
            authUsed: authUsed
        };
    }

    /**
     * 建立文章 Embed
     */
    createArticleEmbed(data, isSpoiler = false) {
        // 🛡️ 如果是防爆雷內容，在描述前面加上防爆雷標記
        let description = data.description;
        if (isSpoiler) {
            description = `||${description}||`;
        }

        const embed = new EmbedBuilder()
            .setColor('#1976D2') // 巴哈藍色
            .setTitle(data.title)
            .setURL(data.url)
            .setDescription(description);

        // 作者資訊
        if (data.authorName && data.authorName !== '未知使用者') {
            embed.setAuthor({
                name: data.authorName,
                iconURL: data.avatarURL,
                url: data.homeURL
            });
        }

        // 文章圖片
        if (data.firstImageURL) {
            // 🛡️ 如果是防爆雷內容，圖片URL加上 SPOILER_ 前綴
            const imageUrl = isSpoiler ? `SPOILER_${data.firstImageURL}` : data.firstImageURL;
            embed.setImage(imageUrl);
        }

        // 推噓數欄位
        const fields = [];

        fields.push({
            name: '👍 推',
            value: data.likeCount.toString(),
            inline: true
        });

        fields.push({
            name: '👎 噓',
            value: data.dislikeCount.toString(),
            inline: true
        });

        embed.addFields(fields);

        // Footer
        embed.setFooter({
            text: isSpoiler ? 'Original by Ermiana 🔒 防爆雷模式' : 'Original by Ermiana'
        });

        embed.setTimestamp();

        return embed;
    }

    /**
     * 建立錯誤回應
     */
    createErrorResponse(message, url) {
        return {
            success: false,
            error: message,
            embed: new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('巴哈姆特文章無法預覽')
                .setDescription(message)
                .setURL(url)
                .setFooter({
                    text: 'Original by Ermiana'
                })
                .setTimestamp(),
            siteName: 'bahamut'
        };
    }

    /**
     * 檢查認證狀態
     */
    async getAuthStatus() {
        return this.auth.getAuthStatus();
    }
}

module.exports = BahamutExtractor;