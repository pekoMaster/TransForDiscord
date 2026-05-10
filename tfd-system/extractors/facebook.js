/**
 * TFD 系統 - Facebook 提取器
 * 使用 Puppeteer 爬蟲提取 Facebook 貼文資料
 */

const puppeteer = require('puppeteer');
const path = require('path');
const TFDEmbedBuilder = require('../utils/embed-builder');
const URLConverterLogger = require('../utils/url-converter-logger');

class FacebookExtractor {
    constructor() {
        this.embedBuilder = new TFDEmbedBuilder();
        this.name = 'Facebook';
        this.USER_DATA_DIR = path.join(__dirname, '..', '..', 'data', 'chrome_userdata');
    }

    /**
     * 處理 Facebook URL
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { originalURL, patternName } = matchResult;

        try {
            console.log(`[TFD-Facebook] 開始提取: ${originalURL} (模式: ${patternName})`);

            // 公開發文格式：需要先檢查是否為社團貼文
            // story.php 可能是公開貼文或社團貼文，需要動態檢測
            const publicPatterns = ['video', 'watch', 'reel', 'post', 'postSimple', 'shareVideo', 'shareR', 'shareGeneric'];
            const needGroupCheck = ['story']; // 需要檢查社團的格式

            if (publicPatterns.includes(patternName)) {
                console.log(`[TFD-Facebook] 檢測到公開發文格式 (${patternName})，使用快速 URL 轉換`);

                // 直接轉換 URL
                const facebedURL = this.convertToFacebed(originalURL);

                // 記錄 URL 轉換日誌
                URLConverterLogger.logConversion('facebook', message, originalURL, facebedURL, originalURL);

                // 返回簡單的 URL 轉換結果
                return {
                    success: true,
                    siteName: 'facebook',
                    contentType: 'url_conversion',
                    convertedURL: facebedURL,
                    deleteOriginal: false,
                    data: {
                        originalURL: originalURL,
                        convertedURL: facebedURL,
                        patternName: patternName,
                        isPublicContent: true
                    }
                };
            }

            // story.php 格式：需要先檢查是否為社團貼文
            if (needGroupCheck.includes(patternName)) {
                console.log(`[TFD-Facebook] 檢測到 story.php 格式，先檢查是否為社團貼文...`);

                // 快速檢查是否為社團貼文
                const isGroup = await this.quickGroupCheck(originalURL);

                if (isGroup) {
                    console.log(`[TFD-Facebook] ⚠️ 檢測到社團貼文，使用 Puppeteer 提取內容`);
                    // 社團貼文使用 Puppeteer 爬蟲處理，繼續往下執行
                } else {
                    console.log(`[TFD-Facebook] ✅ 公開貼文，使用 Playwright 提取 Open Graph 資料`);

                    // 使用 Playwright 提取 Open Graph 資料
                    const ogData = await this.extractOpenGraphData(originalURL);

                    if (!ogData || !ogData.title) {
                        console.log(`[TFD-Facebook] OG 提取失敗，改用 URL 轉換`);
                        const facebedURL = this.convertToFacebed(originalURL);
                        URLConverterLogger.logConversion('facebook', message, originalURL, facebedURL, originalURL);
                        return {
                            success: true,
                            siteName: 'facebook',
                            contentType: 'url_conversion',
                            convertedURL: facebedURL,
                            deleteOriginal: false,
                            data: {
                                originalURL: originalURL,
                                convertedURL: facebedURL,
                                patternName: patternName,
                                isPublicContent: true
                            }
                        };
                    }

                    // 創建 Embed
                    const embed = this.createOGEmbed(ogData);

                    // 記錄日誌
                    URLConverterLogger.logConversion('facebook', message, originalURL, ogData.url || originalURL, originalURL);

                    return {
                        success: true,
                        siteName: 'facebook',
                        contentType: 'og_embed',
                        embed: embed,
                        deleteOriginal: false,
                        data: {
                            originalURL: originalURL,
                            canonicalURL: ogData.url,
                            ogData: ogData,
                            isPublicContent: true
                        }
                    };
                }
            }

            // 私人/社團內容：使用 Puppeteer 爬蟲
            console.log(`[TFD-Facebook] 私人/社團內容 (${patternName})，使用 Puppeteer 提取`);

            const postData = await this.scrapeFacebookPost(originalURL);

            if (!postData || !postData.content) {
                throw new Error('無法提取貼文內容');
            }

            // 只記錄關鍵資訊，避免輸出大量頁面文字資料
            console.log(`[TFD-Facebook] 提取成功: author=${postData.author || 'N/A'}, hasVideo=${postData.hasVideo}, contentLength=${postData.content?.length || 0}`);

            // 轉換為 facebed URL（類似 vxinstagram）
            const facebedURL = this.convertToFacebed(originalURL);

            // 記錄 URL 轉換日誌
            URLConverterLogger.logConversion('facebook', message, originalURL, facebedURL, originalURL);

            // 創建 Embed
            const embed = this.createEmbed(facebedURL, postData);

            // 返回結果
            const result = {
                success: true,
                siteName: 'facebook',
                embed: embed,
                deleteOriginal: false,  // 不刪除原訊息
                data: {
                    originalURL: originalURL,
                    facebedURL: facebedURL,
                    metadata: postData,
                    isPublicContent: false
                }
            };

            return result;

        } catch (error) {
            console.error(`[TFD-Facebook] 提取失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 使用 Puppeteer 爬取 Facebook 貼文
     * @param {string} url
     * @param {number} retryCount - 重試次數（預設0）
     * @returns {Promise<Object>}
     */
    async scrapeFacebookPost(url, retryCount = 0) {
        const MAX_RETRIES = 1; // 最多重試 1 次，避免無限循環
        let browser = null;

        try {
            if (retryCount > 0) {
                console.log(`[TFD-Facebook] 第 ${retryCount} 次重試提取...`);
            } else {
                console.log(`[TFD-Facebook] 啟動 Puppeteer...`);
            }

            browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    `--user-data-dir=${this.USER_DATA_DIR}`
                ]
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            console.log(`[TFD-Facebook] 正在訪問頁面...`);
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 智能等待機制：等待關鍵元素出現或最多 8 秒
            const isWatchVideo = url.includes('/watch');
            const isGroupPost = url.includes('/groups/');
            const isSharePost = url.includes('/share/p/'); // 新增：share/p/ 格式檢測

            try {
                if (isWatchVideo) {
                    // Watch 影片：等待影片元素
                    await page.waitForSelector('video', { timeout: 8000 });
                    console.log(`[TFD-Facebook] Watch 影片載入完成`);
                } else if (isGroupPost) {
                    // 社團文章：等待文章內容或標題
                    await Promise.race([
                        page.waitForSelector('[data-ad-preview="message"]', { timeout: 8000 }),
                        page.waitForSelector('[role="article"]', { timeout: 8000 }),
                        page.waitForSelector('h2', { timeout: 8000 })
                    ]);
                    console.log(`[TFD-Facebook] 社團文章載入完成`);
                } else {
                    // 一般貼文：等待主要內容
                    await Promise.race([
                        page.waitForSelector('[data-ad-preview="message"]', { timeout: 8000 }),
                        page.waitForSelector('[role="article"]', { timeout: 8000 })
                    ]);
                    console.log(`[TFD-Facebook] 一般貼文載入完成`);
                }
            } catch (waitError) {
                console.log(`[TFD-Facebook] 元素等待超時，繼續處理...`);
                // 繼續執行，嘗試提取任何可用資料
            }

            // 額外等待動態內容載入（社團文章需要更長時間等待圖片）
            const waitTime = isGroupPost ? 5000 : 2000;
            console.log(`[TFD-Facebook] 等待 ${waitTime/1000} 秒讓動態內容載入...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));

            // 圖片提取功能已移除

            // 提取資料
            const data = await page.evaluate((isWatch, isGroup, isShare) => {
                const result = {
                    author: null,
                    content: null,
                    hasVideo: false,
                    comments: null,
                    shares: null,
                    likes: null,
                    hasLoginWall: false,
                    isWatchVideo: isWatch,
                    isGroupPost: isGroup,
                    isSharePost: isShare,
                    groupName: null, // 新增：社團名稱
                    bodyText: '', // 新增：完整的 body 文字
                    allTextNodes: [] // 新增：所有文字節點
                };

                // 🔒 改進的登入牆檢測邏輯（避免誤判）
                // 1. 檢查是否有登入表單（更可靠的指標）
                const hasLoginForm = document.querySelector('input[type="password"]') !== null ||
                                    document.querySelector('input[name="email"]') !== null ||
                                    document.querySelector('#email') !== null;

                // 2. 檢查是否被重定向到登入頁面
                const isLoginPage = window.location.href.includes('/login') ||
                                   window.location.href.includes('/checkpoint');

                // 3. 檢查是否有明確的登入牆訊息
                const hasLoginWallMessage = document.body.textContent.includes('You must log in to continue') ||
                                          document.body.textContent.includes('請登入以繼續') ||
                                          document.body.textContent.includes('Log in to Facebook to start sharing');

                // 只有同時滿足「有表單 + 在登入頁」或「有明確登入牆訊息」才判定為登入牆
                result.hasLoginWall = (hasLoginForm && isLoginPage) || hasLoginWallMessage;

                // 記錄檢測結果（方便除錯）
                if (result.hasLoginWall) {
                    console.log('[FB-Debug] 登入牆檢測: 表單=' + hasLoginForm + ', 登入頁=' + isLoginPage + ', 訊息=' + hasLoginWallMessage);
                }

                // 🔍 提取完整的文字內容（用於關鍵字搜尋）
                // 提取 body 文字
                result.bodyText = document.body.innerText || '';

                // 提取所有文字節點
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );

                let node;
                while (node = walker.nextNode()) {
                    const text = node.textContent.trim();
                    if (text.length > 0) {
                        result.allTextNodes.push(text);
                    }
                }

                console.log('[FB-Debug] 文字提取完成: bodyText=' + result.bodyText.length + '字, textNodes=' + result.allTextNodes.length + '個');

                // 🔍 動態檢測社團貼文（即使 URL 不包含 /groups/）
                if (!isGroup) {
                    // 檢查是否有指向 /groups/ 的連結
                    const groupLinks = document.querySelectorAll('a[href*="/groups/"]');
                    if (groupLinks.length > 0) {
                        result.isGroupPost = true;

                        // 嘗試提取社團名稱（通常是第一個指向社團的連結文字）
                        for (const link of groupLinks) {
                            const text = link.textContent.trim();
                            // 過濾掉太短或太長的文字，以及包含數字的連結
                            if (text && text.length > 3 && text.length < 100 && !text.match(/^\d/)) {
                                result.groupName = text;
                                console.log('[FB Debug] 檢測到社團貼文，社團名稱:', text);
                                break;
                            }
                        }
                    }

                    // 補充檢查：文字中是否包含「私密社團」、「公開社團」
                    if (!result.isGroupPost) {
                        const bodyText = document.body.textContent;
                        if (bodyText.includes('私密社團') ||
                            bodyText.includes('公開社團') ||
                            bodyText.includes('Private group') ||
                            bodyText.includes('Public group')) {
                            result.isGroupPost = true;
                            console.log('[FB Debug] 通過關鍵字檢測到社團貼文');
                        }
                    }
                }

                // 檢查是否有影片（增強檢測）
                const videoElement = document.querySelector('video');
                result.hasVideo = videoElement !== null;

                // 如果有影片，嘗試提取影片 URL
                if (videoElement) {
                    const videoSrc = videoElement.src || videoElement.querySelector('source')?.src;
                    if (videoSrc) {
                        result.videoURL = videoSrc;
                    }
                }

                // Watch 影片的特殊處理
                if (isWatch) {
                    // 尋找包含統計資料的 div
                    const allDivs = document.querySelectorAll('div');
                    let targetDiv = null;

                    for (const div of allDivs) {
                        const text = div.textContent?.trim();
                        if (text && (text.includes('則留言') || text.includes('comments'))) {
                            if (text.length > 20 && text.length < 300) {
                                targetDiv = div;
                                break;
                            }
                        }
                    }

                    if (targetDiv) {
                        const fullText = targetDiv.textContent.trim();

                        // 提取標題（移除時間碼）
                        const titleMatch = fullText.match(/^(?:\d+:\d+\s*\/\s*\d+:\d+\s*)?(.+?)(?:讚留言分享|Like|Comment|Share)/s);
                        if (titleMatch) {
                            result.content = titleMatch[1].trim().replace(/\n/g, ' ');
                        }

                        // 提取按讚數
                        const likesMatch = fullText.match(/(\d+(?:[,.\s]\d+)*[KMB]?)\s*(?=\s*·\s*\d+則留言|·\s*\d+\s*comments)/);
                        if (likesMatch) {
                            result.likes = likesMatch[1].replace(/\s/g, '');
                        }

                        // 提取留言數
                        const commentsMatch = fullText.match(/(\d+(?:[,.\s]\d+)*[KMB]?)\s*則留言|(\d+(?:[,.\s]\d+)*[KMB]?)\s*comments/i);
                        if (commentsMatch) {
                            result.comments = (commentsMatch[1] || commentsMatch[2]).replace(/\s/g, '');
                        }
                    }

                    // 暫時不提取作者（因為名稱包含亂碼）
                    // 直接使用 URL 中的資訊或設為 null

                    return result;
                }

                // 社團文章的專門處理
                if (isGroup) {
                    console.log('[FB Debug] 處理社團文章...');

                    // 1. 提取作者 - 使用 h2 span[0]，去除「的貼文」
                    const h2Span = document.querySelector('h2 span');
                    if (h2Span && h2Span.innerText) {
                        const authorText = h2Span.innerText.trim();
                        // 去除「的貼文」或 "'s post"
                        result.author = authorText.replace('的貼文', '').replace("'s post", '').trim();
                        console.log('[FB Debug] 找到作者:', result.author);
                    }

                    // 2. 提取內文 - 使用 [data-ad-preview="message"] 的 index [1]
                    const contentElements = document.querySelectorAll('[data-ad-preview="message"]');
                    console.log('[FB Debug] 找到', contentElements.length, '個內文元素');

                    if (contentElements.length > 1) {
                        // 使用 index [1] 而不是 [0]
                        result.content = contentElements[1].innerText.trim();
                        console.log('[FB Debug] 使用 index [1] 找到內文長度:', result.content.length);
                    } else if (contentElements.length === 1) {
                        // 如果只有一個，使用 [0]
                        result.content = contentElements[0].innerText.trim();
                        console.log('[FB Debug] 使用 index [0] 找到內文長度:', result.content.length);
                    } else {
                        // 備用方案：嘗試其他選擇器
                        const altContentElement = document.querySelector('[data-ad-comet-preview="message"]');
                        if (altContentElement) {
                            result.content = altContentElement.innerText.trim();
                            console.log('[FB Debug] 使用備用選擇器找到內文長度:', result.content.length);
                        }
                    }

                    // 圖片提取功能已移除，只保留影片檢測

                    // 檢查影片
                    const articleElement = document.querySelector('[role="article"]');
                    result.hasVideo = articleElement ? (articleElement.querySelector('video') !== null) : false;

                    console.log('[FB Debug] 媒體: 影片 =', result.hasVideo);

                    // 4. 提取統計資訊（社團文章）
                    const statsText = document.body.innerText;

                    // 提取留言數
                    const commentPatterns = [
                        /(\d+(?:[,.]\d+)?[KMB]?)\s*則留言/,
                        /(\d+(?:[,.]\d+)?[KMB]?)\s*comments/i
                    ];

                    for (const pattern of commentPatterns) {
                        const match = statsText.match(pattern);
                        if (match) {
                            result.comments = match[1];
                            console.log('[FB Debug] 找到留言數:', result.comments);
                            break;
                        }
                    }

                    // 提取分享數
                    const sharePatterns = [
                        /(\d+(?:[,.]\d+)?[KMB]?)\s*次分享/,
                        /(\d+(?:[,.]\d+)?[KMB]?)\s*shares/i
                    ];

                    for (const pattern of sharePatterns) {
                        const match = statsText.match(pattern);
                        if (match) {
                            result.shares = match[1];
                            console.log('[FB Debug] 找到分享數:', result.shares);
                            break;
                        }
                    }

                    // 提取按讚數 - 在「所有心情：」之後的數字
                    const lines = statsText.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        // 找到「所有心情：」這一行
                        if (line.includes('所有心情') || line.includes('All reactions')) {
                            // 檢查下一行是否是純數字
                            if (i + 1 < lines.length) {
                                const nextLine = lines[i + 1].trim();
                                // 檢查是否是純數字或 K/M/B 格式
                                if (/^\d+(?:[,.]\d+)?[KMB]?$/.test(nextLine)) {
                                    result.likes = nextLine;
                                    console.log('[FB Debug] 找到按讚數:', result.likes);
                                    break;
                                }
                            }
                        }
                    }

                    console.log('[FB Debug] 統計資訊:', {
                        likes: result.likes || 'none',
                        comments: result.comments || 'none',
                        shares: result.shares || 'none'
                    });

                    return result;
                }

                // 圖片提取功能已移除

                // 2. 提取作者
                const h2Elements = document.querySelectorAll('h2');
                for (const h2 of h2Elements) {
                    const text = h2.innerText.trim();
                    if (text.includes('的貼文') || text.includes("'s post")) {
                        result.author = text.replace('的貼文', '').replace("'s post", '').trim();
                        break;
                    }
                }

                if (!result.author && document.title) {
                    const titleMatch = document.title.match(/\|\s*(.+?)的貼文|\|\s*(.+?)'s\s+post/);
                    if (titleMatch) {
                        result.author = (titleMatch[1] || titleMatch[2]).trim();
                    }
                }

                // 3. 提取留言數和分享數
                const textElements = document.querySelectorAll('span, div, a');
                const numberPattern = /(\d+(?:[,.]\d+)?[KMB]?)\s*(comments?|則留言|shares?|次分享)/i;

                textElements.forEach(el => {
                    const text = el.innerText.trim();
                    const match = text.match(numberPattern);

                    if (match) {
                        const number = match[1];
                        const type = match[2].toLowerCase();

                        if ((type.includes('comment') || type.includes('留言')) && !result.comments) {
                            result.comments = number;
                        } else if ((type.includes('share') || type.includes('分享')) && !result.shares) {
                            result.shares = number;
                        }
                    }
                });

                // 檢查 aria-label
                document.querySelectorAll('[aria-label]').forEach(el => {
                    const label = el.getAttribute('aria-label');
                    const match = label?.match(numberPattern);

                    if (match) {
                        const number = match[1];
                        const type = match[2].toLowerCase();

                        if ((type.includes('comment') || type.includes('留言')) && !result.comments) {
                            result.comments = number;
                        } else if ((type.includes('share') || type.includes('分享')) && !result.shares) {
                            result.shares = number;
                        }
                    }
                });

                // share/p/ 格式的專門處理（使用與社團相同的邏輯）
                if (isShare) {
                    console.log('[FB Debug] 處理 share/p/ 格式...');

                    // 1. 提取作者 - 使用 h2 span[0]
                    const h2Span = document.querySelector('h2 span');
                    if (h2Span && h2Span.innerText) {
                        const authorText = h2Span.innerText.trim();
                        result.author = authorText.replace('的貼文', '').replace("'s post", '').trim();
                        console.log('[FB Debug] 找到作者:', result.author);
                    }

                    // 2. 提取內文 - 使用 [data-ad-preview="message"] 的 index [1]（與社團相同）
                    const contentElements = document.querySelectorAll('[data-ad-preview="message"]');
                    console.log('[FB Debug] 找到', contentElements.length, '個內文元素');

                    if (contentElements.length > 1) {
                        // 使用 index [1] 而不是 [0]
                        result.content = contentElements[1].innerText.trim();
                        console.log('[FB Debug] 使用 index [1] 找到內文長度:', result.content.length);
                    } else if (contentElements.length === 1) {
                        // 如果只有一個，使用 [0]
                        result.content = contentElements[0].innerText.trim();
                        console.log('[FB Debug] 使用 index [0] 找到內文長度:', result.content.length);
                    } else {
                        // 備用方案：嘗試其他選擇器
                        const altContentElement = document.querySelector('[data-ad-comet-preview="message"]');
                        if (altContentElement) {
                            result.content = altContentElement.innerText.trim();
                            console.log('[FB Debug] 使用備用選擇器找到內文長度:', result.content.length);
                        }
                    }

                    // 圖片提取功能已移除，只保留影片檢測

                    // 檢查影片
                    const articleElement = document.querySelector('[role="article"]');
                    result.hasVideo = articleElement ? (articleElement.querySelector('video') !== null) : false;

                    return result;
                }

                // ==== 新增：通用內容提取邏輯 ====
                // 適用於 photo、permalink 等 generic 格式
                // 修復日期：2025-11-13

                if (!result.content) {
                    console.log('[FB Debug] 開始通用內容提取...');

                    // 優先方案：data-ad-preview="message" (適用於大多數格式)
                    const messageElements = document.querySelectorAll('[data-ad-preview="message"]');
                    if (messageElements.length > 0) {
                        result.content = messageElements[0].innerText.trim();
                        console.log('[FB Debug] 通用提取成功 (data-ad-preview):', result.content.substring(0, 50));
                    }

                    // 備用方案 1: meta description (適用於 photo 等)
                    if (!result.content || result.content.length < 10) {
                        const metaDesc = document.querySelector('meta[name="description"]');
                        const metaOgDesc = document.querySelector('meta[property="og:description"]');

                        const desc = metaDesc?.content || metaOgDesc?.content;
                        if (desc && desc.length > 20) {
                            result.content = desc.trim();
                            console.log('[FB Debug] 通用提取成功 (meta):', result.content.substring(0, 50));
                        }
                    }

                    // 備用方案 2: document.title (最後手段)
                    if (!result.content || result.content.length < 10) {
                        const cleanTitle = document.title.split('|')[0].trim();
                        if (cleanTitle.length > 10) {
                            result.content = cleanTitle;
                            console.log('[FB Debug] 通用提取成功 (title):', result.content.substring(0, 50));
                        }
                    }

                    if (!result.content) {
                        console.log('[FB Debug] ⚠️ 通用提取失敗，content 仍為 null');
                    }
                }

                return result;
            }, isWatchVideo, isGroupPost, isSharePost);

            await browser.close();

            // 檢查登入牆
            if (data.hasLoginWall) {
                // 檢查是否已達最大重試次數
                if (retryCount >= MAX_RETRIES) {
                    console.error(`[TFD-Facebook] ❌ 已達最大重試次數 (${MAX_RETRIES})，停止重試`);
                    throw new Error('Facebook 登入牆阻擋，已達最大重試次數');
                }

                console.log('[TFD-Facebook] ⚠️ 檢測到登入牆，嘗試自動登入...');

                // 嘗試自動登入
                const loginSuccess = await this.autoLogin();

                if (loginSuccess) {
                    console.log('[TFD-Facebook] ✅ 自動登入成功，重試提取...');
                    // 重新啟動瀏覽器並重試（傳遞重試次數）
                    return await this.scrapeFacebookPost(url, retryCount + 1);
                } else {
                    throw new Error('Facebook 登入牆阻擋，自動登入失敗，請手動執行登入工具');
                }
            }

            return data;

        } catch (error) {
            console.error(`[TFD-Facebook] Puppeteer 錯誤:`, error);
            if (browser) {
                await browser.close();
            }
            throw error;
        }
    }

    /**
     * 使用 Playwright 提取 Open Graph 資料
     * @param {string} url - Facebook URL
     * @returns {Promise<Object|null>}
     */
    async extractOpenGraphData(url) {
        const { chromium } = require('playwright');
        let browser = null;

        try {
            console.log('[TFD-Facebook-OG] 啟動完全隔離的 Playwright 提取 Open Graph 資料...');
            console.log('[TFD-Facebook-OG] 目標 URL:', url);

            // 🔥 完全隔離的瀏覽器環境（無快取污染）
            browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-sync',
                    '--incognito'  // 強制無痕模式
                ]
            });

            // 🔥 完全乾淨的上下文
            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 },
                storageState: undefined,  // 完全禁用持久化
                acceptDownloads: false,
                ignoreHTTPSErrors: true,
                javaScriptEnabled: true
            });

            const page = await context.newPage();

            console.log('[TFD-Facebook-OG] 正在訪問頁面...');
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            console.log('[TFD-Facebook-OG] 等待並滾動載入圖片...');
            await page.waitForTimeout(8000);

            // 🔥 滾動頁面以載入延遲載入的圖片
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => window.scrollBy(0, window.innerHeight));
                await page.waitForTimeout(1500);
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(2000);

            console.log('[TFD-Facebook-OG] 提取資料...');
            const result = await page.evaluate(() => {
                const data = {
                    title: null,
                    description: null,
                    url: null,
                    siteName: 'Facebook'
                };

                // 提取 OG 資料
                const getOG = (prop) => {
                    const meta = document.querySelector(`meta[property="${prop}"]`);
                    return meta ? meta.getAttribute('content') : null;
                };

                // 🔥 標題清理：移除 | xxx | Facebook 後綴
                let rawTitle = getOG('og:title');
                if (rawTitle) {
                    // 移除最後的 | Facebook
                    rawTitle = rawTitle.replace(/\s*\|\s*Facebook\s*$/i, '');
                    // 移除其他 | 和後面的內容
                    const parts = rawTitle.split('|');
                    if (parts.length > 1) {
                        data.title = parts[0].trim();
                    } else {
                        data.title = rawTitle.trim();
                    }
                } else {
                    data.title = null;
                }

                data.description = getOG('og:description');
                data.url = getOG('og:url');

                // 圖片提取功能已移除

                return data;
            });

            await browser.close();

            console.log('[TFD-Facebook-OG] ✅ 資料提取成功');
            console.log(`[TFD-Facebook-OG] 標題: ${result.title}`);

            return result;

        } catch (error) {
            console.error('[TFD-Facebook-OG] ❌ Open Graph 提取失敗:', error.message);
            if (browser) {
                await browser.close();
            }
            return null;
        }
    }

    /**
     * 根據 Open Graph 資料創建 Discord Embed
     * @param {Object} ogData - Open Graph 資料
     * @returns {Object}
     */
    createOGEmbed(ogData) {
        const { EmbedBuilder } = require('discord.js');

        const embed = new EmbedBuilder()
            .setColor(0x1877F2); // Facebook 藍色

        // 標題：使用作者名稱
        if (ogData.author) {
            embed.setTitle(ogData.author);
        } else if (ogData.title) {
            // 如果沒有作者，才使用原標題
            const title = ogData.title.length > 256
                ? ogData.title.substring(0, 253) + '...'
                : ogData.title;
            embed.setTitle(title);
        }

        // 描述：使用 description，而非 title
        if (ogData.description) {
            // 限制描述長度為 300 字元
            const description = ogData.description.length > 300
                ? ogData.description.substring(0, 297) + '...'
                : ogData.description;
            embed.setDescription(description);
        }

        // URL
        if (ogData.url) {
            embed.setURL(ogData.url);
        }

        // 圖片功能已移除

        // Footer：包含統計數據（用 emoji）
        let footerText = 'Facebook';

        // 從 title 提取統計數據（觀看次數和心情數）
        if (ogData.title) {
            // 提取觀看次數：「1.5 萬次觀看」→ 「👁️ 1.5 萬」
            const viewsMatch = ogData.title.match(/([\d.,]+\s*[萬千百]?)次觀看/);
            if (viewsMatch) {
                footerText += ` • 👁️ ${viewsMatch[1]}`;
            }

            // 提取心情數：「92 個心情」→ 「❤️ 92」
            const reactionsMatch = ogData.title.match(/([\d.,]+)\s*個心情/);
            if (reactionsMatch) {
                footerText += ` • ❤️ ${reactionsMatch[1]}`;
            }
        }

        // 內容類型
        if (ogData.type) {
            const typeMap = {
                'video.other': '影片',
                'article': '文章',
                'website': '網站'
            };
            const typeText = typeMap[ogData.type] || ogData.type;
            footerText += ` • ${typeText}`;
        }

        embed.setFooter({ text: footerText });

        return embed;
    }

    /**
     * 轉換為 Facebed URL
     * @param {string} url - 原始 Facebook URL
     * @returns {string}
     */
    convertToFacebed(url) {
        // 將 facebook.com 替換為 facebed.com（同時移除 www.）
        return url
            .replace(/www\.facebook\.com/g, 'facebed.com')
            .replace(/m\.facebook\.com/g, 'facebed.com')
            .replace(/facebook\.com/g, 'facebed.com');
    }

    /**
     * 創建 Discord Embed
     * @param {string} url - Facebed URL
     * @param {Object} postData - 貼文資料
     * @returns {Object}
     */
    createEmbed(url, postData) {
        // 標題
        let title = postData.isWatchVideo ? '📹 Facebook Watch 影片' : '📘 Facebook 貼文';
        if (postData.author) {
            title = `${postData.author}`;
        }

        // 描述（內文）
        let description = '';
        if (postData.content) {
            description = this.truncateContent(postData.content, 300);
        }

        // Footer（統計資訊）
        const stats = [];
        if (postData.likes) stats.push(`❤️ ${postData.likes}`);
        if (postData.comments) stats.push(`💬 ${postData.comments}`);
        if (postData.shares) stats.push(`📤 ${postData.shares}`);

        let footerText = stats.length > 0 ? stats.join(' · ') : '';
        if (postData.hasVideo) {
            footerText = (footerText ? footerText + ' · ' : '') + '🎬 包含影片';
        }
        // 圖片顯示功能已移除

        // 創建 embed 資料
        const embedData = {
            title: this.embedBuilder.truncateText(title, 200),
            description: description,
            url: url,
            color: this.embedBuilder.getSiteColor('facebook'),
            footer: {
                text: footerText,
                iconURL: 'https://www.facebook.com/favicon.ico'
            }
        };

        // 圖片設定功能已移除

        return this.embedBuilder.createBasicEmbed(embedData);
    }

    /**
     * 截斷內文到指定長度
     * @param {string} text
     * @param {number} maxLength
     * @returns {string}
     */
    truncateContent(text, maxLength = 100) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...(詳全文)';
    }

    /**
     * 創建錯誤回應
     * @param {string} message
     * @param {string} url
     * @returns {Object}
     */
    createErrorResponse(message, url) {
        return {
            success: false,
            error: message,
            embed: this.embedBuilder.createErrorEmbed(`Facebook 取得失敗: ${message}`, url),
            siteName: 'facebook'
        };
    }

    /**
     * 快速檢查是否為社團貼文
     * @param {string} url
     * @returns {Promise<boolean>} 是否為社團貼文
     */
    async quickGroupCheck(url) {
        // 快速檢查：如果 URL 本身就包含 /groups/，肯定是社團
        if (url.includes('/groups/')) {
            console.log('[TFD-Facebook] URL 包含 /groups/，確定為社團貼文');
            return true;
        }

        // 如果 URL 是 story.php 但不包含 /groups/，99% 機率是公開貼文
        // 避免不必要的頁面載入和潛在的超時問題
        if (url.includes('story.php') && !url.includes('/groups/')) {
            console.log('[TFD-Facebook] story.php 格式且不含 /groups/，判定為公開貼文');
            return false;
        }

        // 其他情況才需要載入頁面驗證
        let browser = null;

        try {
            console.log('[TFD-Facebook] 需要載入頁面進行深度檢查...');

            browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    `--user-data-dir=${this.USER_DATA_DIR}`
                ]
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });

            // 等待 8 秒讓動態內容和 Canonical URL 完全載入
            // Facebook 頁面使用 JavaScript 動態生成 Canonical URL，需要較長等待時間
            await new Promise(resolve => setTimeout(resolve, 8000));

            // 檢查是否為社團貼文
            const checkResult = await page.evaluate(() => {
                const result = {
                    isGroup: false,
                    canonicalURL: null,
                    reason: ''
                };

                // 優先檢查 Canonical URL（最可靠的判定方式）
                const canonicalLink = document.querySelector('link[rel="canonical"]');
                if (canonicalLink) {
                    result.canonicalURL = canonicalLink.getAttribute('href');

                    // 如果 canonical URL 包含 /reel/, /watch/, /videos/，肯定是公開影片內容
                    if (result.canonicalURL.includes('/reel/') ||
                        result.canonicalURL.includes('/watch/') ||
                        result.canonicalURL.includes('/videos/')) {
                        result.isGroup = false;
                        result.reason = `Canonical URL 重定向到公開影片: ${result.canonicalURL}`;
                        return result;
                    }

                    // 如果 canonical URL 包含 /groups/，肯定是社團內容
                    if (result.canonicalURL.includes('/groups/')) {
                        result.isGroup = true;
                        result.reason = `Canonical URL 包含 /groups/: ${result.canonicalURL}`;
                        return result;
                    }
                }

                // 檢查是否有指向 /groups/ 的連結
                const groupLinks = document.querySelectorAll('a[href*="/groups/"]');
                if (groupLinks.length > 0) {
                    result.isGroup = true;
                    result.reason = '頁面包含 /groups/ 連結';
                    return result;
                }

                // 檢查文字中是否包含社團關鍵字
                const bodyText = document.body.textContent;
                if (bodyText.includes('私密社團') ||
                    bodyText.includes('公開社團') ||
                    bodyText.includes('Private group') ||
                    bodyText.includes('Public group')) {
                    result.isGroup = true;
                    result.reason = '頁面包含社團關鍵字';
                    return result;
                }

                result.isGroup = false;
                result.reason = '無社團標記';
                return result;
            });

            await browser.close();

            console.log(`[TFD-Facebook] 社團檢查結果: ${checkResult.isGroup ? '是社團貼文' : '非社團貼文'}`);
            console.log(`[TFD-Facebook] 判定理由: ${checkResult.reason}`);
            if (checkResult.canonicalURL) {
                console.log(`[TFD-Facebook] Canonical URL: ${checkResult.canonicalURL}`);
            }

            return checkResult.isGroup;

        } catch (error) {
            console.error('[TFD-Facebook] 快速檢查失敗:', error.message);
            if (browser) {
                await browser.close();
            }
            // 檢查失敗時，保守地假設不是社團貼文
            return false;
        }
    }

    /**
     * 搜尋 Facebook 貼文中的關鍵字
     * @param {string} url - Facebook URL
     * @param {Array<string>} keywords - 要搜尋的關鍵字陣列
     * @returns {Promise<Object>} 搜尋結果
     */
    async searchKeywords(url, keywords) {
        try {
            console.log(`[TFD-Facebook-Search] 開始搜尋關鍵字: ${keywords.join(', ')}`);

            // 使用現有的 scrapeFacebookPost 方法取得貼文資料
            const postData = await this.scrapeFacebookPost(url);

            if (!postData) {
                throw new Error('無法提取貼文資料');
            }

            // 搜尋結果
            const searchResults = {
                url: url,
                keywords: keywords,
                found: {},
                summary: {
                    totalKeywords: keywords.length,
                    foundCount: 0,
                    notFoundCount: 0
                }
            };

            // 對每個關鍵字進行搜尋
            for (const keyword of keywords) {
                const keywordResult = {
                    keyword: keyword,
                    foundInBody: false,
                    foundInTextNodes: false,
                    foundInContent: false,
                    matchingNodes: [],
                    found: false
                };

                // 在 bodyText 中搜尋
                if (postData.bodyText && postData.bodyText.includes(keyword)) {
                    keywordResult.foundInBody = true;
                    keywordResult.found = true;
                }

                // 在 content（貼文內容）中搜尋
                if (postData.content && postData.content.includes(keyword)) {
                    keywordResult.foundInContent = true;
                    keywordResult.found = true;
                }

                // 在 textNodes 中搜尋
                if (postData.allTextNodes && postData.allTextNodes.length > 0) {
                    const matchingNodes = postData.allTextNodes.filter(text => text.includes(keyword));
                    if (matchingNodes.length > 0) {
                        keywordResult.foundInTextNodes = true;
                        keywordResult.matchingNodes = matchingNodes;
                        keywordResult.found = true;
                    }
                }

                searchResults.found[keyword] = keywordResult;

                if (keywordResult.found) {
                    searchResults.summary.foundCount++;
                } else {
                    searchResults.summary.notFoundCount++;
                }
            }

            console.log(`[TFD-Facebook-Search] 搜尋完成: 找到 ${searchResults.summary.foundCount}/${searchResults.summary.totalKeywords} 個關鍵字`);

            return searchResults;

        } catch (error) {
            console.error(`[TFD-Facebook-Search] 搜尋失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 自動登入 Facebook
     * @returns {Promise<boolean>} 登入是否成功
     */
    async autoLogin() {
        const puppeteer = require('puppeteer');
        let browser = null;

        try {
            console.log('[TFD-Facebook-Login] 🌐 啟動登入流程...');
            console.log('[TFD-Facebook-Login] 📢 瀏覽器視窗即將開啟，請手動完成登入');

            browser = await puppeteer.launch({
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    `--user-data-dir=${this.USER_DATA_DIR}`
                ]
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await page.goto('https://www.facebook.com/login', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            await new Promise(resolve => setTimeout(resolve, 3000));

            console.log('\n════════════════════════════════════════════════════════════');
            console.log('📋 請在瀏覽器中手動完成 Facebook 登入');
            console.log('   1. 輸入您的 Facebook 帳號和密碼');
            console.log('   2. 完成所有驗證步驟（如二步驟驗證）');
            console.log('   3. 登入成功並看到 Facebook 首頁後');
            console.log('   4. 等待 30 秒自動儲存登入狀態');
            console.log('════════════════════════════════════════════════════════════\n');

            console.log('[TFD-Facebook-Login] ⏳ 等待 30 秒讓用戶完成登入...\n');
            await new Promise(resolve => setTimeout(resolve, 30000));

            // 🔍 改進的登入驗證邏輯
            const currentUrl = page.url();
            console.log(`[TFD-Facebook-Login] 當前 URL: ${currentUrl}`);

            // 1. 檢查 URL 是否離開登入頁面
            const urlCheck = !currentUrl.includes('/login') && !currentUrl.includes('/checkpoint');
            console.log(`[TFD-Facebook-Login] URL 檢查: ${urlCheck ? '✅ 已離開登入頁' : '❌ 仍在登入頁'}`);

            // 2. 檢查頁面是否有用戶資訊（表示已登入）
            const hasUserInfo = await page.evaluate(() => {
                // 檢查是否有用戶個人檔案相關元素
                const hasProfile = document.querySelector('[aria-label*="你的個人檔案"]') !== null ||
                                 document.querySelector('[aria-label*="Your profile"]') !== null ||
                                 document.querySelector('[aria-label*="Account"]') !== null;

                // 檢查是否有用戶頭像
                const hasAvatar = document.querySelector('image[href*="scontent"]') !== null ||
                                document.querySelector('img[data-visualcompletion="media-vc-image"]') !== null;

                console.log('[FB-Login-Debug] 個人檔案元素:', hasProfile, '頭像:', hasAvatar);
                return hasProfile || hasAvatar;
            });
            console.log(`[TFD-Facebook-Login] 用戶資訊檢查: ${hasUserInfo ? '✅ 找到用戶資訊' : '❌ 未找到用戶資訊'}`);

            // 綜合判斷
            const isLoggedIn = urlCheck && hasUserInfo;

            if (isLoggedIn) {
                console.log('[TFD-Facebook-Login] ✅ 登入成功！登入狀態已自動儲存');
                console.log(`[TFD-Facebook-Login] 📁 儲存位置: ${this.USER_DATA_DIR}`);
            } else {
                console.log('[TFD-Facebook-Login] ⚠️ 未檢測到登入成功');
                console.log(`[TFD-Facebook-Login] 原因: URL=${urlCheck ? '正常' : '異常'}, 用戶資訊=${hasUserInfo ? '有' : '無'}`);
            }

            console.log('[TFD-Facebook-Login] ⏳ 5 秒後自動關閉瀏覽器...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            await browser.close();
            return isLoggedIn;

        } catch (error) {
            console.error('[TFD-Facebook-Login] ❌ 自動登入失敗:', error.message);
            if (browser) {
                await browser.close();
            }
            return false;
        }
    }
}

module.exports = FacebookExtractor;
