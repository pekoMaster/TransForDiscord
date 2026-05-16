/**
 * TFD 系統 - PTT 提取器
 * 提取 PTT 文章和看板資訊
 */

const HTTPClient = require('../utils/http-client');
const DOMParser = require('../../src/shared/html/dom-parser');
const TFDEmbedBuilder = require('../utils/embed-builder');
const tfd = require('../../utils/tfd-logger');
const PTTCacheManager = require('../../utils/ptt-cache-manager');
const _pttCacheManager = new PTTCacheManager();

class PTTExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.domParser = new DOMParser();
        this.embedBuilder = new TFDEmbedBuilder();
        this.cacheManager = _pttCacheManager;
        this.name = 'PTT';
    }

    /**
     * 提取作者 ID（移除括號後的內容）
     * @param {string} authorString - 完整作者字串 (例如: "cloud7515 (殿)")
     * @returns {string} - 作者 ID (例如: "cloud7515")
     */
    extractAuthorId(authorString) {
        if (!authorString) return '';
        const match = authorString.match(/^([^\s(]+)/);
        return match ? match[1].trim() : authorString.trim();
    }

    extractArticleHash(url) {
        const match = url.match(/\/([A-Za-z0-9._-]+)\.html/);
        return match ? match[1] : url.replace(/[^a-zA-Z0-9]/g, '').slice(-20);
    }

    /**
     * 處理 PTT URL
     * @param {Object} matchResult
     * @param {Object} message Discord 訊息物件（未使用，保留向下相容）
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { siteName, patternName, extractedData, originalURL } = matchResult;

        // 🔄 統一轉換為 pttweb.cc（ptt.cc 長期連線不穩定，ECONNRESET 頻發）
        let processURL = this.convertToPttweb(originalURL);

        try {
            switch (patternName) {
                case 'article':
                    return await this.extractArticle(extractedData, processURL, originalURL);
                case 'board':
                    return await this.extractBoard(extractedData.board, processURL);
                default:
                    throw new Error(`不支援的 PTT 模式: ${patternName}`);
            }
        } catch (error) {
            tfd.sysError('TFD-PTT', `提取失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 提取文章資訊
     * @param {Object} extractedData
     * @param {string} fetchURL - 實際請求用的 URL（pttweb.cc）
     * @param {string} displayURL - 顯示用的原始 URL（ptt.cc）
     * @returns {Promise<Object>}
     */
    async extractArticle(extractedData, fetchURL, displayURL = null) {
        const { board, timestamp, hash } = extractedData;
        if (!displayURL) displayURL = fetchURL;

        // 🔄 嘗試從 pttweb.cc 獲取 HTML（帶 over18 cookie，否則 18+ 看板回 404）
        const pttHeaders = { headers: { Cookie: 'over18=1' } };
        let html = await this.httpClient.fetchHTML(fetchURL, pttHeaders);
        let fallbackURL = null;

        // 🔍 檢查是否為錯誤回應
        if (html && typeof html === 'object' && html.error) {
            if (html.status === 404) {
                return this.create404Response(displayURL);
            }

            // 🔄 備援：pttweb.cc 失敗 → 改用 ptt.cc（反之亦然）
            if (fetchURL.includes('pttweb.cc')) {
                fallbackURL = this.convertToPtt(fetchURL);
            } else {
                fallbackURL = this.convertToPttweb(fetchURL);
            }

            html = await this.httpClient.fetchHTML(fallbackURL, pttHeaders);

            if ((html && typeof html === 'object' && html.error) || !html) {
                throw new Error('無法取得文章內容（主要和備援 URL 均失敗）');
            }
        }

        if (!html) {
            throw new Error('無法取得文章內容');
        }

        const $ = this.domParser.parse(html);
        const articleData = this.parseArticleHTML(html, board);

        // 🖼️ 提取文章中的所有圖片（排除簽名檔）
        const validImages = this.extractImagesFromArticle($);

        // 🏠 儲存到快取（供翻頁、展開全文和重整使用）
        if (validImages.length > 0 || articleData.isTruncated) {
            await this.cacheManager.saveToCache(displayURL, articleData, validImages);
        }

        return this.createArticleResponse(articleData, displayURL, validImages, 0);
    }

    /**
     * 提取看板資訊
     * @param {string} board
     * @param {string} originalURL
     * @returns {Promise<Object>}
     */
    async extractBoard(board, originalURL) {
        const html = await this.httpClient.fetchHTML(originalURL, { headers: { Cookie: 'over18=1' } });
        if (!html) {
            throw new Error('無法取得看板內容');
        }

        const boardData = this.parseBoardHTML(html, board);

        return this.createBoardResponse(boardData, originalURL);
    }

    /**
     * 解析 PTT 文章 HTML
     * @param {string} html
     * @param {string} board
     * @returns {Object}
     */
    parseArticleHTML(html, board) {
        const $ = this.domParser.parse(html);

        // 判斷是否為 pttweb.cc（Nuxt SSR，使用 schema.org itemprop）
        const isPttweb = $.html().includes('pttweb.cc') || $('span[itemprop="headline"]').length > 0;

        // 提取文章標題
        let title = '';
        if (isPttweb) {
            title = $('span[itemprop="headline"]').first().text().trim();
        }
        if (!title) {
            title = $('#main-content .article-meta-value[data-time]').first().parent()
                .find('.article-meta-value').first().text().trim() ||
                $('.article-metaline:contains("標題") .article-meta-value').text().trim() ||
                $('.title').text().trim() ||
                $('title').text().replace(' - PTT 網頁版', '').trim();
        }

        title = this.cleanTitle(title);

        if (!title || title === '404') {
            const ogTitle = $('meta[property="og:title"]').attr('content');
            if (ogTitle) {
                title = this.cleanTitle(ogTitle);
            }
        }

        // 提取作者資訊
        let author = '';
        if (isPttweb) {
            const authorName = $('span[itemprop="name"]').first().text().trim();
            const authorNick = $('.e7-head-small').first().text().trim();
            if (authorName) {
                author = authorNick ? `${authorName} ${authorNick}` : authorName;
            }
        }
        if (!author) {
            const authorElements = $('.article-meta-value');
            author = authorElements.length > 0 ? authorElements.eq(0).text().trim() : '';
        }
        if (!author) {
            const htmlText = $.html();
            const authorMatch = htmlText.match(/"author":\s*"([^"]+)"/);
            author = authorMatch ? authorMatch[1] : '未知';
        }

        // 提取發文時間
        let publishTime = '';
        if (isPttweb) {
            const datePublished = $('meta[itemprop="datePublished"]').attr('content');
            if (datePublished) {
                const d = new Date(datePublished);
                publishTime = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
            }
        }
        if (!publishTime) {
            const timeElement = $('.article-metaline:contains("時間") .article-meta-value');
            publishTime = timeElement.text().trim();
        }
        if (!publishTime) {
            const htmlText = $.html();
            const timeMatch = htmlText.match(/"date":\s*"([^"]+)"/) ||
                              htmlText.match(/"createTime":\s*"([^"]+)"/);
            if (timeMatch) {
                publishTime = timeMatch[1];
            }
        }

        // 提取文章內容
        let content = '';
        if (isPttweb) {
            content = this.extractPttwebContent($);
        }
        if (!content || content.length < 10) {
            content = this.extractArticleContent($);
        }
        if (!content || content.length < 10) {
            const ogDescription = $('meta[property="og:description"]').attr('content');
            if (ogDescription && ogDescription.length > 10) {
                content = ogDescription.replace(/\. /g, '\n').trim();
            }
        }

        // 提取推文統計
        let pushStats;
        if (isPttweb) {
            pushStats = this.extractPttwebPushStats($);
        }
        if (!pushStats || pushStats.total === 0) {
            const classicStats = this.extractPushStats($);
            if (classicStats.total > 0) pushStats = classicStats;
        }
        if (!pushStats) pushStats = { likes: 0, dislikes: 0, neutrals: 0, total: 0, score: 0 };

        // 提取看板資訊
        let boardName = '';
        if (isPttweb) {
            boardName = $('.e7-board-name-standalone').first().text().trim();
        }
        if (!boardName) {
            const boardElement = $('.article-metaline-right .article-meta-value');
            boardName = boardElement.text().trim() || board;
        }

        const fullContent = content;
        const truncatedContent = this.truncateContent(content);
        const isTruncated = truncatedContent !== content;

        return {
            title: title,
            author: author,
            board: boardName,
            publishTime: publishTime,
            content: isTruncated ? truncatedContent : content,
            fullContent: fullContent,
            isTruncated: isTruncated,
            pushStats: pushStats,
            url: null
        };
    }

    /**
     * 解析 PTT 看板 HTML
     * @param {string} html
     * @param {string} board
     * @returns {Object}
     */
    parseBoardHTML(html, board) {
        const $ = this.domParser.parse(html);

        // 提取看板名稱和描述
        const boardTitle = $('.board-name').text().trim() || board;
        const boardDescription = $('.board-title').text().trim();

        // 提取最新文章
        const articles = [];
        $('.r-ent').slice(0, 5).each((index, element) => {
            const $article = $(element);
            const title = $article.find('.title a').text().trim();
            const author = $article.find('.author').text().trim();
            const date = $article.find('.date').text().trim();
            const link = $article.find('.title a').attr('href');

            if (title && author) {
                articles.push({
                    title: title,
                    author: author,
                    date: date,
                    link: link ? `https://www.ptt.cc${link}` : null
                });
            }
        });

        return {
            name: boardTitle,
            description: boardDescription,
            articles: articles
        };
    }

    /**
     * 提取 pttweb.cc 文章內容
     * @param {Object} $ - Cheerio 物件
     * @returns {string}
     */
    extractPttwebContent($) {
        const mainContent = $('.e7-main-content');
        if (mainContent.length === 0) return '';

        let text = '';
        mainContent.each((_, el) => {
            text += $(el).text() + '\n';
        });

        // 移除簽名檔和發信站資訊
        const sendStationMarker = '※ 發信站: 批踢踢實業坊(ptt.cc)';
        const markerIndex = text.indexOf(sendStationMarker);
        if (markerIndex !== -1) {
            text = text.substring(0, markerIndex);
        }

        text = this.removeQuotedText(text);
        text = text.replace(/--[\s\S]*?--/g, '');
        text = text.replace(/\n{3,}/g, '\n\n').trim();

        return text;
    }

    /**
     * 提取 pttweb.cc 推文統計
     * @param {Object} $ - Cheerio 物件
     * @returns {Object}
     */
    extractPttwebPushStats($) {
        const counters = $('span[itemprop="userInteractionCount"]');
        if (counters.length < 2) return null;

        const likes = parseInt(counters.eq(0).text().trim()) || 0;
        const dislikes = parseInt(counters.eq(1).text().trim()) || 0;
        const neutrals = counters.length >= 3 ? (parseInt(counters.eq(2).text().trim()) || 0) : 0;

        return {
            likes,
            dislikes,
            neutrals,
            total: likes + dislikes + neutrals,
            score: likes - dislikes
        };
    }

    /**
     * 截斷內容（100中文字限制）
     * @param {string} content
     * @returns {string}
     */
    truncateContent(content) {
        if (!content) return '';

        const urlPattern = /https?:\/\/[^\s]+/g;
        const urls = content.match(urlPattern) || [];
        let contentWithoutUrls = content;
        urls.forEach(url => { contentWithoutUrls = contentWithoutUrls.replace(url, ''); });

        const chineseCharCount = (contentWithoutUrls.match(/[一-鿿]/g) || []).length;
        if (chineseCharCount <= 100) return content;

        let charCount = 0;
        let truncated = '';
        let i = 0;
        while (i < content.length && charCount < 100) {
            if (content.substr(i).match(/^https?:\/\//)) {
                const urlMatch = content.substr(i).match(/^https?:\/\/[^\s]+/);
                if (urlMatch) {
                    truncated += urlMatch[0];
                    i += urlMatch[0].length;
                    continue;
                }
            }
            if (content[i].match(/[一-鿿]/)) charCount++;
            truncated += content[i];
            i++;
        }
        return truncated + '\n\n-# ⬇️ 點擊「展開」查看完整內文';
    }

    /**
     * 提取文章內容（排除簽名檔和引文）
     * @param {Object} $
     * @returns {string}
     */
    extractArticleContent($) {
        const mainContent = $('#main-content');

        // 移除不需要的元素
        mainContent.find('.article-metaline, .push, .f2').remove();

        // 取得純文字內容
        let content = mainContent.text().trim();

        // 🔍 方法1：移除「※ 引述」開頭的引文區域
        // 格式：※ 引述 《作者》 之銘言：
        //      : 引文內容（每行開頭有 :）
        content = this.removeQuotedText(content);

        // 🔍 方法2：移除「--」包裹的簽名檔區域
        content = content.replace(/--[\s\S]*?--/g, '');

        // 🔍 方法3：移除「※ 發信站」之後的所有內容（包括簽名檔）
        const sendStationMarker = '※ 發信站: 批踢踢實業坊(ptt.cc)';
        const markerIndex = content.indexOf(sendStationMarker);
        if (markerIndex !== -1) {
            content = content.substring(0, markerIndex);
        }

        // 🔍 方法4：移除「※ 編輯」標記之後的內容（有些文章會有編輯記錄）
        const editMarker = '※ 編輯:';
        const editIndex = content.indexOf(editMarker);
        if (editIndex !== -1) {
            // 保留編輯標記，但移除簽名檔
            const afterEdit = content.substring(editIndex);
            const nextSendStation = afterEdit.indexOf(sendStationMarker);
            if (nextSendStation !== -1) {
                content = content.substring(0, editIndex + nextSendStation);
            }
        }

        // 清理內容
        content = content
            .replace(/\n{3,}/g, '\n\n') // 移除過多換行
            .trim();

        return content;
    }

    /**
     * 移除引文內容
     * @param {string} content - 文章內容
     * @returns {string} - 移除引文後的內容
     */
    removeQuotedText(content) {
        if (!content) return '';

        // 分割成行
        const lines = content.split('\n');
        const result = [];
        let inQuote = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 檢查是否為引述開始標記：※ 引述 《作者》 之銘言：
            if (line.includes('※ 引述') && line.includes('之銘言')) {
                inQuote = true;
                continue; // 跳過引述標記行
            }

            // 如果在引文區域內
            if (inQuote) {
                // 引文每行開頭都是 ": "（冒號 + 空格）或單獨的 ":"
                if (line.trim().startsWith(':')) {
                    continue; // 跳過引文內容行
                } else {
                    // 遇到非引文行，結束引文區域
                    inQuote = false;
                }
            }

            // 如果不在引文區域，保留這行
            if (!inQuote) {
                result.push(line);
            }
        }

        return result.join('\n');
    }

    /**
     * 清理文章標題
     * @param {string} title - 原始標題
     * @returns {string} - 清理後的標題
     */
    cleanTitle(title) {
        if (!title) return '';

        // 移除「 - 看板 XXX - 批踢踢實業坊」後綴
        // 範例：[Figure] 碧藍航線 大鳳 海濱的白日美夢 - 看板 C_Chat - 批踢踢實業坊
        // 結果：[Figure] 碧藍航線 大鳳 海濱的白日美夢
        const boardMarker = ' - 看板 ';
        const markerIndex = title.indexOf(boardMarker);
        if (markerIndex !== -1) {
            title = title.substring(0, markerIndex);
        }

        return title.trim();
    }

    /**
     * 提取推文統計
     * @param {Object} $
     * @returns {Object}
     */
    extractPushStats($) {
        const pushes = $('.push');
        let likes = 0;
        let dislikes = 0;
        let neutrals = 0;

        pushes.each((index, element) => {
            const pushTag = $(element).find('.push-tag').text().trim();
            switch (pushTag) {
                case '推':
                    likes++;
                    break;
                case '噓':
                    dislikes++;
                    break;
                case '→':
                    neutrals++;
                    break;
            }
        });

        return {
            likes: likes,
            dislikes: dislikes,
            neutrals: neutrals,
            total: likes + dislikes + neutrals,
            score: likes - dislikes
        };
    }

    /**
     * 提取文章中的圖片（排除簽名檔）
     * @param {Object} $ - Cheerio 物件
     * @returns {Array} - 有效圖片URL陣列
     */
    extractImagesFromArticle($) {
        try {
            // 支援 ptt.cc (#main-content) 和 pttweb.cc (.e7-main-content)
            let mainContent = $('#main-content');
            if (mainContent.length === 0) {
                mainContent = $('.e7-main-content');
            }
            const contentText = mainContent.text();

            const imageUrlRegex = /https?:\/\/[^\s<>"]+?\.(?:jpg|jpeg|png|gif|webp)/gi;
            const allImageUrls = [];

            const textMatches = contentText.match(imageUrlRegex) || [];
            allImageUrls.push(...textMatches);

            // 從 <img> 標籤提取（pttweb.cc 用 img 顯示圖片）
            mainContent.find('img').each((_, element) => {
                const src = $(element).attr('src');
                if (src && /\.(?:jpg|jpeg|png|gif|webp)/i.test(src)) {
                    allImageUrls.push(src);
                }
            });

            // 從 <a> 標籤的 href 屬性中提取圖片URL
            mainContent.find('a').each((index, element) => {
                const href = $(element).attr('href');
                if (href && /\.(?:jpg|jpeg|png|gif|webp)/i.test(href)) {
                    allImageUrls.push(href);
                }
            });

            // 🔧 備援：從 og:image meta 標籤提取圖片（適用於 pttweb.cc）
            if (allImageUrls.length === 0) {
                const ogImage = $('meta[property="og:image"]').attr('content');
                if (ogImage && imageUrlRegex.test(ogImage)) {
                    allImageUrls.push(ogImage);
                }

                // 🔧 備援：從 og:description 中提取圖片 URL
                const ogDescription = $('meta[property="og:description"]').attr('content');
                if (ogDescription) {
                    const descImageMatches = ogDescription.match(imageUrlRegex) || [];
                    allImageUrls.push(...descImageMatches);
                }
            }

            // 去重
            const uniqueUrls = [...new Set(allImageUrls)];

            if (uniqueUrls.length === 0) {
                return [];
            }

            // 2️⃣ 識別並排除簽名檔區域的圖片
            const signatureUrls = this.extractSignatureImages(contentText);

            // 3️⃣ 過濾有效圖片（排除簽名檔）
            const validImages = uniqueUrls.filter(url => !signatureUrls.has(url));

            return validImages;
        } catch (error) {
            tfd.sysError('PTT-Extractor', `圖片提取失敗: ${error.message}`);
            return [];
        }
    }

    /**
     * 提取簽名檔中的圖片
     * @param {string} contentText - 文章內容文字
     * @returns {Set} - 簽名檔圖片URL集合
     */
    extractSignatureImages(contentText) {
        const signatureUrls = new Set();

        try {
            // 方法1：找出「--」包裹的區域
            const signaturePattern = /--[\s\S]*?--/g;
            const signatureMatches = contentText.match(signaturePattern) || [];

            const imageUrlRegex = /https?:\/\/[^\s<>"]+?\.(?:jpg|jpeg|png|gif|webp)/gi;

            signatureMatches.forEach(signature => {
                const urls = signature.match(imageUrlRegex) || [];
                urls.forEach(url => signatureUrls.add(url));
            });

            // 方法2：找出「※ 發信站」之後的所有圖片（補充檢查）
            const sendStationMarker = '※ 發信站: 批踢踢實業坊(ptt.cc)';
            const markerIndex = contentText.indexOf(sendStationMarker);

            if (markerIndex !== -1) {
                const afterMarkerText = contentText.substring(markerIndex);
                const afterMarkerUrls = afterMarkerText.match(imageUrlRegex) || [];
                afterMarkerUrls.forEach(url => signatureUrls.add(url));
            }

            return signatureUrls;
        } catch (error) {
            tfd.sysError('PTT-Extractor', `簽名檔圖片提取失敗: ${error.message}`);
            return new Set();
        }
    }

    /**
     * 建立文章回應（支援多圖片）
     * @param {Object} articleData
     * @param {string} originalURL
     * @param {Array} validImages - 有效圖片URL陣列
     * @param {number} pageIndex - 當前頁面索引（預設0）
     * @returns {Object}
     */
    createArticleResponse(articleData, originalURL, validImages = [], pageIndex = 0) {
        const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        try {
            if (!articleData || !articleData.title || !articleData.author || !articleData.content) {
                tfd.sysError('PTT-Extractor', `articleData 資料不完整: ${{
                    hasTitle: !!articleData?.title,
                    hasAuthor: !!articleData?.author,
                    hasContent: !!articleData?.content
                }}`);
                throw new Error('文章資料不完整');
            }

            let contentToDisplay = articleData.content;
            let footerText = 'PTT 批踢踢實業坊';
            if (articleData.publishTime && typeof articleData.publishTime === 'string' && articleData.publishTime.trim()) {
                footerText += ` • ${articleData.publishTime.trim()}`;
            }

            // 🔍 在 Description 開頭只顯示作者資訊
            const header = `作者 ${articleData.author}\n\n`;
            const descriptionWithHeader = header + contentToDisplay;

            const embedData = {
                title: this.embedBuilder.truncateText(articleData.title, 200),
                description: descriptionWithHeader,
                url: originalURL,
                color: this.embedBuilder.getSiteColor('ptt'),
                footer: {
                    text: footerText,
                    iconURL: 'https://www.ptt.cc/favicon.ico'
                }
            };

            const embed = this.embedBuilder.createBasicEmbed(embedData);

        // 🖼️ 處理多圖片顯示
        const embeds = [embed];
        let components = [];

        if (validImages.length > 0) {
            const imagesPerPage = 4;
            const startIndex = pageIndex * imagesPerPage;
            const endIndex = Math.min(startIndex + imagesPerPage, validImages.length);
            const currentPageImages = validImages.slice(startIndex, endIndex);

            // 設定主 Embed 的第一張圖片
            if (currentPageImages.length > 0) {
                // 🔧 驗證圖片 URL 格式
                let rawImageUrl = currentPageImages[0];
                if (!rawImageUrl || typeof rawImageUrl !== 'string' || !rawImageUrl.startsWith('http')) {
                    tfd.sysError('PTT-Extractor', `無效的圖片 URL: ${rawImageUrl}`);
                    throw new Error(`無效的圖片 URL: ${rawImageUrl}`);
                }

                // 🔧 將 HTTP 轉換為 HTTPS（Discord 只接受 HTTPS）
                if (rawImageUrl.startsWith('http://')) {
                    rawImageUrl = rawImageUrl.replace('http://', 'https://');
                }

                try {
                    embed.setImage(rawImageUrl);
                } catch (imageError) {
                    tfd.sysError('PTT-Extractor', `setImage 失敗: ${imageError.message}`);
                    tfd.sysError('PTT-Extractor', `圖片 URL: ${rawImageUrl}`);
                    tfd.sysError('PTT-Extractor', `圖片 URL 長度: ${rawImageUrl?.length}`);
                    throw imageError;
                }
            }

            // 如果當前頁面有多張圖片，創建額外的 Embed
            if (currentPageImages.length > 1) {
                for (let i = 1; i < currentPageImages.length; i++) {
                    // 🔧 驗證圖片 URL 格式
                    let rawImageUrl = currentPageImages[i];
                    if (!rawImageUrl || typeof rawImageUrl !== 'string' || !rawImageUrl.startsWith('http')) {
                        tfd.sysError('PTT-Extractor', `無效的圖片 URL [${i}]: ${rawImageUrl}`);
                        continue; // 跳過無效圖片
                    }

                    // 🔧 將 HTTP 轉換為 HTTPS（Discord 只接受 HTTPS）
                    if (rawImageUrl.startsWith('http://')) {
                        rawImageUrl = rawImageUrl.replace('http://', 'https://');
                    }

                    const imageEmbed = new EmbedBuilder()
                        .setURL(originalURL)
                        .setImage(rawImageUrl);
                    embeds.push(imageEmbed);
                }
            }

            // 🔘 如果總圖片數 > 4，添加翻頁按鈕
            if (validImages.length > 4) {
                const totalPages = Math.ceil(validImages.length / imagesPerPage);
                const articleHash = this.cacheManager.extractArticleHash(originalURL);

                let pageFooterText = 'PTT 批踢踢實業坊';
                pageFooterText += ` • 第 ${pageIndex + 1}/${totalPages} 頁 • 共 ${validImages.length} 張圖片`;
                if (articleData.publishTime) {
                    pageFooterText += ` • ${articleData.publishTime}`;
                }
                embed.setFooter({
                    text: pageFooterText,
                    iconURL: 'https://www.ptt.cc/favicon.ico'
                });

                const buttons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ptt_first_${articleHash}_0`)
                            .setLabel('⏪')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(pageIndex === 0),
                        new ButtonBuilder()
                            .setCustomId(`ptt_prev_${articleHash}_${Math.max(0, pageIndex - 1)}`)
                            .setLabel('◀️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(pageIndex === 0),
                        new ButtonBuilder()
                            .setCustomId(`ptt_next_${articleHash}_${Math.min(totalPages - 1, pageIndex + 1)}`)
                            .setLabel('▶️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(pageIndex === totalPages - 1),
                        new ButtonBuilder()
                            .setCustomId(`ptt_last_${articleHash}_${totalPages - 1}`)
                            .setLabel('⏩')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(pageIndex === totalPages - 1)
                    );
                components = [buttons];
            } else if (validImages.length > 0) {
                // 有圖片但不需要翻頁，顯示圖片數量
                let imageFooterText = `PTT 批踢踢實業坊 • 共 ${validImages.length} 張圖片`;
                if (articleData.publishTime) {
                    imageFooterText += ` • ${articleData.publishTime}`;
                }
                embed.setFooter({
                    text: imageFooterText,
                    iconURL: 'https://www.ptt.cc/favicon.ico'
                });
            }
        }

        // 🔘 功能按鈕列
        const articleHash = this.cacheManager.extractArticleHash(originalURL);
        const actionButtons = [];

        // 📖 展開按鈕（文章被截斷時才顯示）
        if (articleData.isTruncated) {
            actionButtons.push(
                new ButtonBuilder()
                    .setCustomId(`ptt_expand_${articleHash}`)
                    .setLabel('展開')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        // 🔄 重整按鈕（所有文章都加入）
        actionButtons.push(
            new ButtonBuilder()
                .setCustomId(`ptt_reload_${articleHash}`)
                .setLabel('重整')
                .setStyle(ButtonStyle.Secondary)
        );

        if (components.length > 0) {
            for (const btn of actionButtons) {
                components[0].addComponents(btn);
            }
        } else {
            components = [new ActionRowBuilder().addComponents(...actionButtons)];
        }

            return {
                success: true,
                embeds: embeds,
                components: components,
                siteName: 'ptt',
                contentType: 'article',
                data: articleData,
                // 向下相容
                embed: embeds[0]
            };
        } catch (error) {
            tfd.sysError('PTT-Extractor', `createArticleResponse 失敗: ${error.message}`);
            tfd.sysError('PTT-Extractor', `錯誤堆疊: ${error.stack}`);
            throw error;
        }
    }

    /**
     * 從快取建立文章回應（用於翻頁）
     * @param {Object} cachedData - 快取資料
     * @param {string} originalURL - 原始URL
     * @param {number} pageIndex - 頁面索引（預設0）
     * @returns {Object}
     */
    createArticleResponseFromCache(cachedData, originalURL, pageIndex = 0) {
        const { articleData, pages, totalImages } = cachedData;

        // 獲取所有圖片URL
        const allImages = pages.flatMap(page => page.images);

        // 使用現有的 createArticleResponse 方法
        return this.createArticleResponse(articleData, originalURL, allImages, pageIndex);
    }

    /**
     * 建立看板回應
     * @param {Object} boardData
     * @param {string} originalURL
     * @returns {Object}
     */
    createBoardResponse(boardData, originalURL) {
        const embed = this.embedBuilder.createBasicEmbed({
            title: `📋 ${boardData.name} 看板`,
            description: boardData.description,
            url: originalURL,
            color: this.embedBuilder.getSiteColor('ptt'),
            footer: {
                text: 'PTT 批踢踢實業坊',
                iconURL: 'https://www.ptt.cc/favicon.ico'
            }
        });

        // 添加最新文章
        if (boardData.articles.length > 0) {
            const articleList = boardData.articles
                .slice(0, 3)
                .map(article => `• ${article.title} - ${article.author}`)
                .join('\n');

            embed.addFields([
                {
                    name: '📰 最新文章',
                    value: articleList,
                    inline: false
                }
            ]);
        }

        return {
            success: true,
            embed: embed,
            siteName: 'ptt',
            contentType: 'board',
            data: boardData
        };
    }

    /**
     * 建立 404 錯誤的迷你 embed
     * @param {string} url
     * @returns {Object}
     */
    create404Response(url) {
        const { EmbedBuilder } = require('discord.js');

        const embed = new EmbedBuilder()
            .setDescription('**404 - Not Found.**')
            .setColor(0x808080) // 灰色
            .setURL(url);

        return {
            success: true, // 標記為成功，讓系統正常顯示 embed
            embeds: [embed],
            siteName: 'ptt',
            contentType: 'error_404',
            // 向下相容
            embed: embed
        };
    }

    /**
     * ptt.cc URL → pttweb.cc URL
     */
    convertToPttweb(url) {
        if (url.includes('pttweb.cc')) return url;
        return url.replace('ptt.cc', 'pttweb.cc').replace(/\.html$/i, '');
    }

    /**
     * pttweb.cc URL → ptt.cc URL
     */
    convertToPtt(url) {
        if (url.includes('ptt.cc') && !url.includes('pttweb.cc')) return url;
        let pttUrl = url.replace('pttweb.cc', 'ptt.cc');
        if (!pttUrl.endsWith('.html')) pttUrl += '.html';
        return pttUrl;
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
            embed: this.embedBuilder.createErrorEmbed(`PTT 取得失敗: ${message}`, url),
            siteName: 'ptt'
        };
    }

    /**
     * 解析 PTT 時間格式
     * @param {string} timeString
     * @returns {Date|null}
     */
    parseTime(timeString) {
        try {
            if (!timeString) return null;

            // PTT 時間格式：Wed Oct  5 12:34:56 2023
            const timeMatch = timeString.match(/(\w{3})\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})/);
            if (timeMatch) {
                const [, , month, day, hour, minute, second, year] = timeMatch;
                const months = {
                    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
                };

                return new Date(year, months[month], day, hour, minute, second);
            }

            return new Date(timeString);
        } catch (error) {
            return null;
        }
    }
}

module.exports = PTTExtractor;
