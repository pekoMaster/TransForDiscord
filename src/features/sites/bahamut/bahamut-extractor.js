/**
 * TFD 系統 - 巴哈姆特提取器
 * 提取巴哈姆特論壇文章資訊，支援年齡限制內容
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BahamutAuth = require('./bahamut-auth');
const BahamutCacheManager = require('./bahamut-cache-manager');
const URLConverterLogger = require('../../../shared/logging/url-converter-logger');
const tfd = require('../../../shared/logging/tfd-logger');

// 巴哈姆特 LOGO（footer 圖示用），來源：巴哈首頁 apple-touch-icon
const BAHAMUT_LOGO_URL = 'https://i2.bahamut.com.tw/apple-touch-icon.png';
// 每頁顯示張數（Discord 單則訊息圖庫上限 4 張）
const IMAGES_PER_PAGE = 4;
// 圖片總數上限（避免極端文章塞爆）
const MAX_IMAGES = 40;

class BahamutExtractor {
    constructor() {
        this.name = 'Bahamut';
        this.auth = new BahamutAuth();
        this.cacheManager = new BahamutCacheManager();
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

        // GNN 新聞走獨立路徑
        if (originalURL.includes('gnn.gamer.com.tw')) {
            return this.extractGNN(originalURL, message, isSpoiler);
        }

        try {
            tfd.sys('Bahamut', `開始處理: ${originalURL}`);

            // 先嘗試無認證請求
            let response = await this.makeRequest(originalURL, false);
            let needsAuth = false;

            if (response.data) {
                const $ = cheerio.load(response.data);

                // 檢查是否需要認證
                if (this.isAgeRestrictionPage($)) {
                    tfd.sys('Bahamut', '檢測到年齡限制，嘗試使用認證...');
                    needsAuth = true;
                } else {
                    // 無需認證，直接處理
                    const articleData = this.parseArticleData($, originalURL);
                    return await this.createSuccessResponse(articleData, false, originalURL, message, isSpoiler);
                }
            }

            // 需要認證或第一次請求失敗
            if (needsAuth || !response.data) {
                tfd.sys('Bahamut', '使用認證模式請求...');
                response = await this.makeRequest(originalURL, true);

                if (response.data) {
                    const $ = cheerio.load(response.data);

                    // 再次檢查是否仍有限制
                    if (this.isAgeRestrictionPage($)) {
                        throw new Error('即使使用認證仍無法訪問該內容');
                    }

                    const articleData = this.parseArticleData($, originalURL);
                    return await this.createSuccessResponse(articleData, true, originalURL, message, isSpoiler);
                }
            }

            throw new Error('無法取得頁面內容');

        } catch (error) {
            tfd.sysError('Bahamut', `處理失敗: ${error.message}`);
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
                tfd.sys('Bahamut', '使用認證 Cookie 請求');
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
            tfd.sysError('Bahamut', `請求失敗: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 處理 GNN 新聞 URL
     */
    async extractGNN(url, message, isSpoiler) {
        try {
            tfd.sys('Bahamut-GNN', `開始處理: ${url}`);
            const response = await this.makeRequest(url, false);
            if (!response.data) throw new Error('無法取得頁面內容');

            const $ = cheerio.load(response.data);
            const data = this.parseGNNArticleData($, url);

            if (message) URLConverterLogger.logConversion('bahamut-gnn', message, url);

            return {
                success: true,
                embed: this.createGNNEmbed(data, isSpoiler),
                siteName: 'bahamut',
                contentType: 'news',
                data
            };
        } catch (error) {
            tfd.sysError('Bahamut-GNN', `處理失敗: ${error.message}`);
            URLConverterLogger.logError('bahamut-gnn', url, error.message);
            return this.createErrorResponse(error.message, url);
        }
    }

    /**
     * 解析 GNN 新聞資料
     */
    parseGNNArticleData($, url) {
        // 標題
        const title = $('meta[property="og:title"]').attr('content')
            || $('.gnn-detail-cont h1').first().text().trim()
            || $('h1').first().text().trim()
            || '巴哈 GNN 新聞';

        // 內文（.GN-lbox3B）
        let description = '';
        const contentEl = $('.GN-lbox3B');
        if (contentEl.length > 0) {
            // 去掉 script/style/iframe，取純文字
            contentEl.find('script, style, iframe, .article_gamercard').remove();
            description = contentEl.text().replace(/\s+/g, ' ').trim();
        }
        if (!description) {
            description = $('meta[property="og:description"]').attr('content') || '無法取得文章內容';
        }
        if (description.length > 150) {
            description = description.substring(0, 150) + '...（詳見原文）';
        }

        // 記者名稱 & 時間（格式：「（GNN 記者 Akito 報導） 2026-05-13 17:20:08」）
        const infoText = $('.GN-lbox3C').first().text().trim();
        let reporterName = 'GNN 記者';
        let publishTime = null;
        if (infoText) {
            const reporterMatch = infoText.match(/GNN\s+記者\s+([^\s）]+)/);
            if (reporterMatch) reporterName = `GNN 記者 ${reporterMatch[1]}`;
            const timeMatch = infoText.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
            if (timeMatch) publishTime = new Date(timeMatch[1]);
        }

        // 第一張圖片
        let imageURL = $('img[name="gnnPIC"]').first().attr('src')
            || $('meta[property="og:image"]').attr('content')
            || null;

        // 標籤
        const tags = [];
        $('.gnn-label .label').each((_, el) => {
            const tag = $(el).text().trim();
            if (tag) tags.push(tag);
        });

        return { title, description, reporterName, publishTime, imageURL, tags, url };
    }

    /**
     * 建立 GNN 新聞 Embed
     */
    createGNNEmbed(data, isSpoiler = false) {
        let desc = isSpoiler ? `||${data.description}||` : data.description;

        const embed = new EmbedBuilder()
            .setColor('#1976D2')
            .setTitle(data.title)
            .setURL(data.url)
            .setDescription(desc)
            .setAuthor({ name: data.reporterName })
            .setFooter({ text: isSpoiler ? 'Peko Embed 🔒 防爆雷模式 | 巴哈 GNN' : 'Peko Embed | 巴哈 GNN' });

        if (data.imageURL) embed.setImage(data.imageURL);
        if (data.publishTime) embed.setTimestamp(data.publishTime);
        else embed.setTimestamp();

        return embed;
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
            tfd.sys('Bahamut', 'JSON-LD 解析失敗');
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

        // 圖片提取 - 取得文章中的圖片（最多 MAX_IMAGES 張，供分頁顯示）
        const images = [];
        const pushImg = (u) => {
            if (!u) return;
            // 排除論壇貼圖/表情（im.bahamut.com.tw/sticker、emotion 圖示）
            if (/im\.bahamut\.com\.tw\/(sticker|emotion)/i.test(u)) return;
            if (!images.includes(u) && images.length < MAX_IMAGES) images.push(u);
        };

        // 方法1: 文章內容圖片（巴哈用 data-src 延遲載入，優先取 data-src）
        $('.c-article__content img').each((i, el) => {
            pushImg($(el).attr('data-src') || $(el).attr('src'));
        });

        // 方法2: 內容無圖則補 JSON-LD 圖片
        if (images.length === 0) {
            try {
                const jsonLD = $('script[type="application/ld+json"]').html();
                if (jsonLD) {
                    const parsed = JSON.parse(jsonLD);
                    const arr = Array.isArray(parsed) ? parsed : [parsed];
                    const article = arr.find(item => item['@type'] === 'Article');
                    if (article && Array.isArray(article.image)) article.image.forEach(pushImg);
                }
            } catch (e) {
                tfd.sys('Bahamut', 'JSON-LD 圖片解析失敗');
            }
        }

        // 方法3: 仍無圖則用 OG image
        if (images.length === 0) {
            pushImg($('meta[property="og:image"]').attr('content'));
        }

        const firstImageURL = images[0] || null;

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
            images,
            url,
            bsn,
            snA
        };
    }

    /**
     * 建立成功回應（多圖時走分頁，每頁 4 張）
     */
    async createSuccessResponse(data, authUsed, originalURL, message, isSpoiler = false) {
        const imgCount = Array.isArray(data.images) ? data.images.length : 0;
        tfd.sys('Bahamut', `成功提取文章: ${data.title}（圖片 ${imgCount} 張）`);

        // 記錄網址轉換
        if (message) {
            URLConverterLogger.logConversion('bahamut', message, originalURL);
        }

        // 圖片數 > 每頁張數 → 需要翻頁，先存快取供按鈕翻頁讀取
        if (!isSpoiler && imgCount > IMAGES_PER_PAGE) {
            await this.cacheManager.saveToCache(originalURL, data);
        }

        const page = this.buildPageResponse(data, originalURL, isSpoiler, 0);

        return {
            success: true,
            embed: page.embed,
            embeds: page.embeds,
            components: page.components,
            siteName: 'bahamut',
            contentType: 'forum_post',
            data: data,
            authUsed: authUsed,
            originalURL: originalURL
        };
    }

    /**
     * 從快取建立指定頁回應（供翻頁按鈕使用）
     */
    createArticleResponseFromCache(cachedData, originalURL, pageIndex = 0) {
        const page = this.buildPageResponse(cachedData.data, originalURL, false, pageIndex);
        return {
            success: true,
            embed: page.embed,
            embeds: page.embeds,
            components: page.components,
            siteName: 'bahamut',
            contentType: 'forum_post',
            data: cachedData.data,
            originalURL: originalURL
        };
    }

    /**
     * 建立某一頁的 embeds + 翻頁按鈕
     * @param {Object} data parseArticleData 結果
     * @param {string} url 原始 URL
     * @param {boolean} isSpoiler 防爆雷
     * @param {number} pageIndex 頁碼（0-based）
     * @returns {{embed: EmbedBuilder, embeds: EmbedBuilder[], components: ActionRowBuilder[]}}
     */
    buildPageResponse(data, url, isSpoiler, pageIndex) {
        const allImages = (data.images || []).filter(u => typeof u === 'string' && u.startsWith('http'));
        const totalImages = allImages.length;
        const totalPages = Math.max(1, Math.ceil(totalImages / IMAGES_PER_PAGE));
        const safePage = Math.min(Math.max(0, pageIndex), totalPages - 1);
        const needPaging = !isSpoiler && totalImages > IMAGES_PER_PAGE;
        const pageImages = isSpoiler
            ? allImages.slice(0, 1)
            : allImages.slice(safePage * IMAGES_PER_PAGE, safePage * IMAGES_PER_PAGE + IMAGES_PER_PAGE);

        // 主 embed（標題/內文/作者/footer）
        let description = data.description;
        if (isSpoiler) description = `||${description}||`;

        const embed = new EmbedBuilder()
            .setColor('#1976D2') // 巴哈藍色
            .setTitle(data.title)
            .setURL(url)
            .setDescription(description);

        if (data.authorName && data.authorName !== '未知使用者') {
            embed.setAuthor({ name: data.authorName, iconURL: data.avatarURL, url: data.homeURL });
        }

        // 主圖（當頁第一張）
        if (pageImages[0]) {
            const img = isSpoiler ? `SPOILER_${pageImages[0]}` : pageImages[0];
            embed.setImage(img);
        }

        // Footer：推噓 + 圖片數/頁碼 + 巴哈 LOGO
        let footerText = `👍 ${data.likeCount}　👎 ${data.dislikeCount}`;
        if (totalImages > 0) footerText += `　•　共 ${totalImages} 張圖`;
        if (needPaging) footerText += `　•　第 ${safePage + 1}/${totalPages} 頁`;
        if (isSpoiler) footerText += '　🔒 防爆雷模式';
        embed.setFooter({ text: footerText, iconURL: BAHAMUT_LOGO_URL });
        embed.setTimestamp();

        // 當頁其餘圖片 → 額外 embed（共用同一 URL，Discord 合併成圖庫）
        const embeds = [embed];
        for (let i = 1; i < pageImages.length; i++) {
            embeds.push(new EmbedBuilder().setURL(url).setImage(pageImages[i]));
        }

        // 翻頁按鈕（圖片數 > 每頁張數才出現）
        const components = [];
        if (needPaging) {
            const hash = this.cacheManager.extractArticleHash(url);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`baha_first_${hash}_0`).setLabel('⏪').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
                new ButtonBuilder().setCustomId(`baha_prev_${hash}_${Math.max(0, safePage - 1)}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
                new ButtonBuilder().setCustomId(`baha_next_${hash}_${Math.min(totalPages - 1, safePage + 1)}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(safePage === totalPages - 1),
                new ButtonBuilder().setCustomId(`baha_last_${hash}_${totalPages - 1}`).setLabel('⏩').setStyle(ButtonStyle.Secondary).setDisabled(safePage === totalPages - 1)
            );
            components.push(row);
        }

        return { embed, embeds, components };
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
                    text: 'Peko Embed'
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
