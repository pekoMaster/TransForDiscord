/**
 * TFD 系統 - 增強版 Twitter/X 提取器
 * 整合最終版 Twitter 提取器的所有功能
 * 支援回覆推文、引用轉推、多圖片分頁、影片重導向等功能
 */

const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
const HTTPClient = require('../../../../tfd-system/utils/http-client');
const TwitterVideoAttachmentOptimizer = require('../media/video-attachment-optimizer');
const MixedMediaHTMLBuilder = require('../../../../tfd-system/render/mixed-media-html-builder');
const TextTruncator = require('../../../../tfd-system/utils/text-truncator');
const URLConverterLogger = require('../../../../tfd-system/utils/url-converter-logger');
const tfd = require('../../../../utils/tfd-logger');
const mediaClassifier = require('./v2/media-classifier');
const videoLinks = require('./v2/video-links');
const classicComponents = require('./v2/classic-components');
const imageHelpers = require('./v2/images');
const normalizer = require('./v2/normalizer');
const tweetInfo = require('./v2/tweet-info');
const responseBuilders = require('./v2/response-builders');
const mediaPolicy = require('./v2/media-policy');
const tweetFetcher = require('./v2/tweet-fetcher');

// 延遲載入 V2 Container Builder（僅影片推文使用，模組可能不存在）
let _v2ContainerBuilder = null;
function getV2ContainerBuilder() {
    if (!_v2ContainerBuilder) {
        try {
            _v2ContainerBuilder = require('../containers/v2-container-builder');
        } catch (e) {
            tfd.sysWarn('Twitter-V2', 'twitter-v2-container-builder 模組不存在，影片 V2 功能停用');
            _v2ContainerBuilder = { buildV2Container: null, cacheTweetData: () => {} };
        }
    }
    return _v2ContainerBuilder;
}

class TFDTwitterExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.name = 'Twitter/X';
        this.iconURL = 'https://pekoembed.canaria.cc/pic/twitter.png';
        this.videoOptimizer = new TwitterVideoAttachmentOptimizer();
        this.htmlBuilder = new MixedMediaHTMLBuilder();
        this.textTruncator = new TextTruncator();

        // 2026-04-11: 自家 Vercel embed 影片 URL，取代 vxtwitter
        try {
            const config = require('../../../../tfd-system/config/tfd-config.json');
            this.vercelEmbedBaseUrl = config.features?.twitterEmbedProxy?.vercelEmbedBaseUrl || '';
        } catch {
            this.vercelEmbedBaseUrl = '';
        }
    }

    /**
     * 處理 Twitter URL - 整合最終版功能
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { extractedData, originalURL, patternName } = matchResult;

        try {
            // 🆕 檢查是否為個人資料頁面
            if (patternName === 'profile') {
                const username = extractedData.username;
                return await this.handleProfileExtraction(username, originalURL, message);
            }

            // 原有的推文處理邏輯
            const tid = extractedData.tweetId;
            return await this.handleEnhancedTwitterExtraction(tid, originalURL, message);
        } catch (error) {
            URLConverterLogger.logError('twitter', originalURL, error.message);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 增強版 Twitter 提取邏輯
     * @param {string} tid
     * @param {string} originalURL
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async handleEnhancedTwitterExtraction(tid, originalURL, message = null) {
        try {
            // 🔍 檢查是否為第三方轉換服務的 URL（vxtwitter, fxtwitter, fixupx 等）
            const isThirdPartyUrl = /(?:vxtwitter\.com|fxtwitter\.com|fixupx\.com|twittpr\.com)/i.test(originalURL);

            if (isThirdPartyUrl) {
                // 第三方 URL：只檢查黑名單，不做內容處理

                return this.createPassthroughResponse(originalURL);
            }

            // 原始 Twitter/X URL：正常處理流程（fxtwitter → vxtwitter fallback）
            const tweetResult = await this.fetchTweetData(tid);

            if (!tweetResult) {
                tfd.sysWarn('Twitter-Extractor', `推文不可用（fxtwitter + vxtwitter 均失敗）| TweetID: ${tid}`);
                return this.createPassthroughResponse(originalURL);
            }

            if (tweetResult.source === 'vxtwitter') {
                tfd.sys('Twitter-Extractor', `使用 vxtwitter fallback 成功 | TweetID: ${tid}`);
            }

            const tweet = tweetResult.tweet;

            // 分析推文類型
            const tweetType = this.analyzeTweetType(tweet);
            // 分析推文類型完成

            // 處理不同類型的推文
            // 2026-04-11: 所有影片類型推文改用 V2 Container（取代 vxtwitter redirect）
            const videoTypes = ['video', 'multi-video', 'multi-video-with-images', 'video-with-images'];
            if (videoTypes.includes(tweetType)) {
                return await this.handleVideoTweetV2(tweet, originalURL, tweetType, message);
            }

            // 📝 Twitter 文章（長文模式）
            if (tweetType === 'article') {
                return this.handleArticleTweet(tweet, originalURL);
            }

            // 🔧 獲取回覆資訊（檢查推文本身是否為回覆，而非依賴 tweetType）
            let replyInfo = null;
            if (this.isReplyTweet(tweet)) {
                // LOG removed for simplicity
                replyInfo = await this.getReplyTweetInfo(tweet);
            }

            // 🔧 獲取引用資訊（檢查推文本身是否為引用轉推，而非依賴 tweetType）
            let quoteInfo = null;
            if (this.isQuoteTweet(tweet)) {
                // LOG removed for simplicity
                quoteInfo = this.getQuoteTweetInfo(tweet);
            }

            // 2026-04-11: 回覆/引用含影片時不再轉 vxtwitter，統一走 embed 流程 + Vercel 影片 URL

            // 🌐 檢查是否應該使用 Google Apps Script 模式
            if (this.shouldUseGASVideoMode(tweet.id, tweetType)) {
                const gasResult = await this.handleGASVideoMode(tweet, originalURL, tweetType);
                if (gasResult) {
                    return {
                        embed: null,
                        components: null,
                        videoUrls: [],
                        gasResult: gasResult
                    };
                }
            }

            // 🖼️ 檢查是否為純多圖片推文（針對特定推文ID使用多嵌入式訊息方式）
            const shouldUseMultipleEmbeds = this.shouldUseMultipleEmbeds(tweet.id, tweetType);
            let multipleImages = null;

            if (shouldUseMultipleEmbeds) {
                multipleImages = this.extractMultipleImages(tweet);
            }

            // 建立增強版嵌入式訊息（預設隱藏引用原文）
            // 方法內部會處理文字截斷並返回 truncationResult
            const embedResult = this.buildEnhancedEmbed(tweet, originalURL, replyInfo, tweetType, quoteInfo, false);
            const embed = embedResult.embed;
            const truncationResult = embedResult.truncationResult;

            // 如果使用多嵌入式訊息，移除主嵌入式訊息中的圖片
            if (shouldUseMultipleEmbeds && multipleImages && multipleImages.length > 0) {
                // 移除主嵌入式訊息中的圖片，使用多嵌入式訊息
                embed.setImage(null);
            }

            // 建立分頁按鈕（如果需要且沒有使用多嵌入式訊息）
            let components = shouldUseMultipleEmbeds
                ? null // 使用多嵌入式訊息就不需要分頁按鈕
                : this.buildPaginationButtons(tweet, tweetType);

            // 🔧 整合所有切換按鈕到同一排（翻譯、引用、回覆、全文）
            const toggleButtons = [];

            // 🌐 翻譯按鈕（最左側）- 只有文字內容足夠才顯示
            const textContent = tweet.text || '';
            if (textContent.trim().length >= 10) {
                toggleButtons.push(this.buildTranslateButtonComponent(tweet.id, false)); // false = 初始未翻譯狀態
            }

            // 單一展開按鈕（合併引用、回覆、全文）
            const hasExpandable = (quoteInfo && quoteInfo.tweet) || (replyInfo && replyInfo.tweet) || (truncationResult && truncationResult.isTruncated);
            if (hasExpandable) {
                toggleButtons.push(this.buildAllToggleButtonComponent(tweet.id, false)); // false = 初始收起狀態
            }

            // 🔄 重新整理按鈕（用於重新讀取推文跟圖片）
            toggleButtons.push(this.buildReloadButtonComponent(tweet.id));

            // 如果有任何切換按鈕，整合到同一個 ActionRow
            if (toggleButtons.length > 0) {
                const toggleRow = new ActionRowBuilder().addComponents(...toggleButtons);
                if (components) {
                    // 檢查是否已達到 Discord 組件限制（最多 5 個 ActionRow）
                    if (components.length < 5) {
                        components.push(toggleRow);
                    }
                } else {
                    components = [toggleRow];
                }
            }

            // 處理視頻 URL
            const videoUrls = this.extractVideoUrls(tweet);

            const result = {
                success: true,
                embed: embed,
                components: components,
                siteName: 'twitter',
                contentType: tweetType,
                videoUrls: videoUrls,
                replyInfo: replyInfo,
                originalText: tweet.text, // 保存原始文字用於翻譯
                fullText: truncationResult ? truncationResult.fullText : tweet.text, // 完整文字用於展開按鈕
                tweetId: tweet.id, // Tweet ID 用於快取
                originalURL: originalURL // 🔧 總是設置原始 URL
            };

            // 添加多圖片嵌入式訊息相關資訊
            if (shouldUseMultipleEmbeds && multipleImages && multipleImages.length > 0) {
                result.multipleImages = multipleImages;

                // 檢查是否有 mosaic 合併圖
                if (tweet.media?.mosaic?.type === 'mosaic_photo') {
                    result.mosaicUrl = tweet.media.mosaic.formats.jpeg;
                }
            }

            return result;

        } catch (error) {
            tfd.sysError('Enhanced-Twitter', `處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 分析推文類型 (支援混合媒體)
     */
    analyzeTweetType(tweet) {
        return mediaClassifier.analyzeTweetType(tweet);
    }

    /**
     * 處理 Twitter 文章（長文模式）
     */
    handleArticleTweet(tweet, originalURL) {
        const article = tweet.article;
        const embed = new EmbedBuilder();
        embed.setColor(0x1DA1F2);

        // Author 資訊
        try {
            embed.setAuthor({
                name: `@${tweet.author.screen_name}`,
                iconURL: tweet.author.profile_image_url_https || tweet.author.avatar_url,
                url: `https://twitter.com/${tweet.author.screen_name}`
            });
        } catch (e) { /* ignore */ }

        // 文章標題
        const title = article.title || tweet.author.name || tweet.author.screen_name;
        embed.setTitle(title);
        embed.setURL(originalURL);

        // 文章內容：組合所有 content blocks
        let fullText = '';
        if (article.content && article.content.blocks) {
            fullText = article.content.blocks
                .filter(b => b.text && b.text.trim())
                .map(b => b.text.trim())
                .join('\n\n');
        }

        // 如果沒有 content blocks，使用 preview_text
        if (!fullText && article.preview_text) {
            fullText = article.preview_text;
        }

        // 截斷處理
        let truncationResult = null;
        if (fullText) {
            truncationResult = this.textTruncator.processTweetContent(fullText, '文章');
            embed.setDescription(truncationResult.text);
        }

        // 封面圖片
        if (article.cover_media && article.cover_media.original_img_url) {
            embed.setImage(article.cover_media.original_img_url);
        }

        // Footer：標示為文章 + 互動數據
        const engagement = tweet.engagement || {};
        const stats = [];
        if (engagement.likes) stats.push(`❤️ ${engagement.likes.toLocaleString()}`);
        if (engagement.retweets) stats.push(`🔁 ${engagement.retweets.toLocaleString()}`);
        if (engagement.views) stats.push(`👁️ ${engagement.views.toLocaleString()}`);
        const footerText = `📝 X 文章` + (stats.length > 0 ? `　${stats.join('　')}` : '');
        embed.setFooter({ text: footerText });

        // 時間戳
        if (tweet.created_timestamp) {
            embed.setTimestamp(new Date(tweet.created_timestamp * 1000));
        }

        // 按鈕：翻譯 + 顯示全文
        const toggleButtons = [];

        if (fullText && fullText.length >= 10) {
            toggleButtons.push(this.buildTranslateButtonComponent(tweet.id, false));
        }

        if (truncationResult && truncationResult.isTruncated) {
            toggleButtons.push(this.buildAllToggleButtonComponent(tweet.id, false));
        }

        // 🔄 重新整理按鈕
        toggleButtons.push(this.buildReloadButtonComponent(tweet.id));

        let components = null;
        if (toggleButtons.length > 0) {
            components = [new ActionRowBuilder().addComponents(...toggleButtons)];
        }

        return {
            success: true,
            embed: embed,
            components: components,
            siteName: 'twitter',
            contentType: 'article',
            videoUrls: [],
            originalText: fullText,
            fullText: truncationResult ? truncationResult.fullText : fullText,
            tweetId: tweet.id,
            originalURL: originalURL
        };
    }

    /**
     * 處理混合媒體推文 (影片+圖片 或 多影片)
     */
    async handleMixedMediaTweet(tweet, originalURL, tweetType) {
        // 處理混合媒體推文

        try {
            // 🔧 獲取回覆資訊（修復：混合媒體推文也需要檢查回覆）
            let replyInfo = null;
            if (this.isReplyTweet(tweet)) {
                replyInfo = await this.getReplyTweetInfo(tweet);
            }

            // 🔧 獲取引用資訊
            let quoteInfo = null;
            if (this.isQuoteTweet(tweet)) {
                quoteInfo = this.getQuoteTweetInfo(tweet);
            }

            // 🎬 嘗試影片附件優化
            const videoOptimization = await this.videoOptimizer.processVideoOptimization(tweet, originalURL);

            // 建立嵌入式訊息（傳入 replyInfo 和 quoteInfo）
            const embedResult = this.buildEnhancedEmbed(tweet, originalURL, replyInfo, tweetType, quoteInfo, false);
            const embed = embedResult.embed;

            // 提取影片 URLs 用於外部發送
            const videoUrls = this.extractVideoUrls(tweet);
            let formattedVideoUrls = this.formatVideoUrls(videoUrls);

            // 如果有影片附件優化，修改處理方式
            if (videoOptimization && videoOptimization.hasVideoAttachment) {
                // 移除第一個影片的連結（已作為附件）
                if (formattedVideoUrls.length > 0) {
                    formattedVideoUrls = formattedVideoUrls.slice(1);
                }
            }

            // 建立分頁按鈕（如果是 video-with-images）
            let components = this.buildPaginationButtons(tweet, tweetType);

            // 🔧 整合所有切換按鈕到同一排（翻譯、引用、回覆）
            const toggleButtons = [];

            // 🌐 翻譯按鈕（最左側）- 只有文字內容足夠才顯示
            const textContent = tweet.text || '';
            if (textContent.trim().length >= 10) {
                toggleButtons.push(this.buildTranslateButtonComponent(tweet.id, false));
            }

            // 單一展開按鈕（合併引用、回覆）
            const hasExpandable = (quoteInfo && quoteInfo.tweet) || (replyInfo && replyInfo.tweet);
            if (hasExpandable) {
                toggleButtons.push(this.buildAllToggleButtonComponent(tweet.id, false));
            }

            // 🔄 重新整理按鈕
            toggleButtons.push(this.buildReloadButtonComponent(tweet.id));

            // 如果有任何切換按鈕，整合到同一個 ActionRow
            if (toggleButtons.length > 0) {
                const toggleRow = new ActionRowBuilder().addComponents(...toggleButtons);
                if (components) {
                    if (components.length < 5) {
                        components.push(toggleRow);
                    }
                } else {
                    components = [toggleRow];
                }
            }

            // 🖼️ 提取圖片（如果有）
            const images = this.extractMultipleImages(tweet);

            const result = {
                success: true,
                embed: embed,
                components: components,
                siteName: 'twitter',
                contentType: tweetType,
                videoUrls: formattedVideoUrls, // 格式化的影片連結
                multipleImages: images.length > 0 ? images : null, // 🆕 添加圖片陣列
                mixedMedia: true, // 標記為混合媒體
                originalText: tweet.text, // 保存原始文字用於翻譯
                originalURL: originalURL, // 🆕 保存原始 URL（用於 embed URL 統一）
                tweetId: tweet.id // 🆕 保存推文 ID
            };

            // 添加影片附件相關資訊
            if (videoOptimization) {
                result.videoAttachment = videoOptimization.videoAttachment;
                result.videoAttachmentCleanup = videoOptimization.cleanup;
                result.videoAttachmentInfo = videoOptimization.videoInfo;
            }

            return result;

        } catch (error) {
            tfd.sysError('Enhanced-Twitter', `混合媒體處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 處理影片推文
     * 🔧 2026-02-07: 使用 vxtwitter.com 讓 Discord 可直接內嵌播放影片
     */
    handleVideoTweet(tweet, originalURL, message = null) {
        // 使用 vxtwitter.com 處理影片推文
        const vxtwitterURL = originalURL.replace(/x\.com|twitter\.com/, 'vxtwitter.com');

        // 記錄網址轉換
        URLConverterLogger.logConversion('twitter', message, vxtwitterURL);

        return {
            success: true,
            siteName: 'twitter',
            redirect: true,
            redirectURL: vxtwitterURL,
            contentType: 'video-redirect'
        };
    }

    /**
     * 處理影片推文 - V2 Container 版本
     * 2026-04-11: 取代 vxtwitter redirect，所有影片推文統一用 V2 Container
     * @param {Object} tweet - fxtwitter 推文物件
     * @param {string} originalURL - 原始推文 URL
     * @param {string} tweetType - 推文類型
     * @param {Object} message - Discord 訊息物件（可選）
     */
    async handleVideoTweetV2(tweet, originalURL, tweetType, message = null) {
        try {
            // 取得回覆/引用資訊
            let replyData = null;
            let quoteData = null;

            if (this.isReplyTweet(tweet)) {
                replyData = await this.getReplyTweetInfo(tweet);
                if (replyData) {
                    replyData = { tweet: replyData.tweet, tweetId: replyData.tweetId };
                }
            }

            if (this.isQuoteTweet(tweet)) {
                const qi = this.getQuoteTweetInfo(tweet);
                if (qi) {
                    quoteData = { tweet: qi.tweet, tweetId: qi.tweetId };
                }
            }

            // 建構 V2 Container
            const { buildV2Container, cacheTweetData } = getV2ContainerBuilder();
            if (!buildV2Container) {
                // V2 模組不存在，降級為 vxtwitter redirect
                return this.handleVideoTweet(tweet, originalURL, message);
            }
            const container = buildV2Container(tweet, originalURL, {
                quoteData,
                replyData,
            });

            // 快取推文資料（供按鈕互動重建 Container 用）
            cacheTweetData(tweet.id, { tweet, originalURL, quoteData, replyData });

            // 記錄轉換
            URLConverterLogger.logConversion('twitter', message, `[V2] ${originalURL}`);

            return {
                success: true,
                siteName: 'twitter',
                contentType: tweetType,
                isV2: true,
                v2Container: container,
                tweetId: tweet.id,
                originalURL: originalURL,
                originalText: tweet.text,
                tweet: tweet,  // 供降級時重建舊版 embed 使用
            };
        } catch (error) {
            tfd.sysError('Enhanced-Twitter', `V2 Container 建構失敗: ${error.message}`);
            // 降級回 vxtwitter redirect
            return this.handleVideoTweet(tweet, originalURL, message);
        }
    }

    /**
     * 檢查是否為回覆推文
     */
    isReplyTweet(tweet) {
        return mediaClassifier.isReplyTweet(tweet);
    }

    /**
     * 檢查是否為引用轉推
     */
    isQuoteTweet(tweet) {
        return mediaClassifier.isQuoteTweet(tweet);
    }

    /**
     * 檢查是否有影片內容
     */
    hasVideoContent(tweet) {
        return mediaClassifier.hasVideoContent(tweet);
    }

    /**
     * 檢查是否有圖片內容
     */
    hasImageContent(tweet) {
        return mediaClassifier.hasImageContent(tweet);
    }

    /**
     * 獲取圖片數量
     */
    getImageCount(tweet) {
        return mediaClassifier.getImageCount(tweet);
    }

    /**
     * 獲取影片數量
     */
    getVideoCount(tweet) {
        return mediaClassifier.getVideoCount(tweet);
    }

    /**
     * 檢查是否應該使用多嵌入式訊息顯示多圖片
     */
    shouldUseMultipleEmbeds(tweetId, tweetType) {
        return mediaPolicy.shouldUseMultipleEmbeds(tweetId, tweetType);
    }

    /**
     * 檢查是否應該使用 Google Apps Script 影片播放模式
     */
    shouldUseGASVideoMode(tweetId, tweetType) {
        return mediaPolicy.shouldUseGASVideoMode(tweetId, tweetType);
    }

    /**
     * 處理 Google Apps Script 影片播放模式
     */
    async handleGASVideoMode(tweet, originalURL, tweetType) {
        try {
            // 從 .env 讀取 GAS URL
            const gasURL = process.env.GOOGLE_APP_SCRIPT_URL;
            if (!gasURL) {
                tfd.sysError('Enhanced-Twitter', '未配置 GOOGLE_APP_SCRIPT_URL 環境變數');
                return null;
            }

            // 提取推文 ID
            const tweetId = this.extractTweetId(originalURL);
            if (!tweetId) {
                tfd.sysError('Enhanced-Twitter', '無法提取推文 ID');
                return null;
            }

            // 建構 GAS URL
            const gasQueryURL = `${gasURL}?tweet_id=${tweetId}&type=${tweetType}&original_url=${encodeURIComponent(originalURL)}`;
            // LOG removed for simplicity

            return {
                gasURL: gasQueryURL,
                originalURL: originalURL,
                tweetType: tweetType,
                mode: 'gas_video'
            };

        } catch (error) {
            tfd.sysError('Enhanced-Twitter', `GAS 模式處理錯誤: ${error}`);
            return null;
        }
    }

    /**
     * 從 URL 中提取推文 ID
     */
    extractTweetId(url) {
        return tweetInfo.extractTweetId(url);
    }

    /**
     * 處理 HTML 影片播放模式
     */
    async handleHTMLVideoMode(tweet, originalURL, tweetType) {
        try {
            // 提取影片和圖片
            const videos = MixedMediaHTMLBuilder.extractVideos(tweet);
            const images = MixedMediaHTMLBuilder.extractImages(tweet);

            // LOG removed for simplicity

            // 建構推文資料
            const tweetData = {
                author: {
                    name: tweet.author?.name || 'Unknown',
                    screen_name: tweet.author?.screen_name || 'unknown'
                },
                text: tweet.text || '',
                created_at: tweet.created_at
            };

            // 生成 HTML 內容
            const htmlContent = this.htmlBuilder.buildHTML({
                tweetData,
                videos,
                images,
                originalURL,
                siteName: 'Enhanced TFD'
            });

            // LOG removed for simplicity

            // 建立一個基本的 embed 以符合處理流程要求
            const basicEmbed = this.buildBasicEmbed(tweet, originalURL, tweetType);

            // 返回 HTML 回應結果
            return {
                success: true,
                htmlContent: htmlContent,
                embed: basicEmbed, // 添加基本 embed 以符合處理流程
                contentType: tweetType,
                siteName: 'twitter',
                isHTMLResponse: true, // 標記為 HTML 回應
                originalURL: originalURL,
                videosCount: videos.length,
                imagesCount: images.length
            };

        } catch (error) {
            tfd.sysError('Enhanced-Twitter', `HTML 影片播放模式處理失敗: ${error.message}`);
            tfd.sysError('Twitter-V2', error.stack);

            // 回退到一般混合媒體處理
            // LOG removed for simplicity
            return await this.handleMixedMediaTweetFallback(tweet, originalURL, tweetType);
        }
    }

    /**
     * 建立基本的嵌入式訊息 (用於 HTML 回應)
     */
    buildBasicEmbed(tweet, originalURL, tweetType) {
        const embed = new EmbedBuilder();

        // 設定 Author 資訊：用戶ID、頭像、個人頁面
        if (tweet.author) {
            embed.setAuthor({
                name: `@${tweet.author.screen_name}`, // 用戶的實際ID
                iconURL: tweet.author.profile_image_url_https || tweet.author.avatar_url, // 用戶頭像
                url: `https://twitter.com/${tweet.author.screen_name}` // 用戶個人頁面
            });

            // 設定標題：只顯示用戶暱稱
            const displayName = tweet.author.name || tweet.author.screen_name;
            embed.setTitle(displayName);
        }

        // 基本 Embed 不設定 Description（因為無法判斷推文類型）

        // 設定顏色和時間戳
        embed.setColor(0x1DA1F2);
        embed.setURL(originalURL);

        if (tweet.created_at) {
            const createdDate = new Date(tweet.created_at);
            embed.setTimestamp(createdDate);
        }

        return embed;
    }

    /**
     * HTML 模式失敗時的回退處理
     */
    async handleMixedMediaTweetFallback(tweet, originalURL, tweetType) {
        // 建立嵌入式訊息
        const embedResult = this.buildEnhancedEmbed(tweet, originalURL, null, tweetType, null);
        const embed = embedResult.embed;

        // 提取影片 URLs 用於外部發送
        const videoUrls = this.extractVideoUrls(tweet);
        const formattedVideoUrls = this.formatVideoUrls(videoUrls);

        // 建立分頁按鈕
        let components = this.buildPaginationButtons(tweet, tweetType);

        // 🌐 添加翻譯按鈕
        components = this.addTranslateButtonToComponents(components, tweet);

        return {
            success: true,
            embed: embed,
            components: components,
            siteName: 'twitter',
            contentType: tweetType,
            videoUrls: formattedVideoUrls,
            mixedMedia: true,
            tweetId: tweet.id,
            originalText: tweet.text // 保存原始文字用於翻譯
        };
    }

    /**
     * 提取多圖片URL陣列
     */
    extractMultipleImages(tweet) {
        return imageHelpers.extractMultipleImages(tweet, error => {
            tfd.sysError('Enhanced-Twitter', `提取多圖片失敗: ${error.message}`);
        });
    }

    /**
     * 取得推文資料，依序嘗試 fxtwitter → vxtwitter
     * @param {string} tid - 推文 ID
     * @returns {Promise<{tweet: Object, source: string}|null>}
     */
    async fetchTweetData(tid) {
        return tweetFetcher.fetchTweetData(tid, {
            fetchJSON: url => this.httpClient.fetchJSON(url),
            normalizeVxTwitterResponse: (data, tweetId) => this.normalizeVxTwitterResponse(data, tweetId),
            logFallback: tweetId => tfd.sys('Twitter-Extractor', `fxtwitter 失敗，嘗試 vxtwitter fallback | TweetID: ${tweetId}`),
        });
    }

    /**
     * 將 vxtwitter API 回應格式轉為 fxtwitter 相容格式
     * @param {Object} data - vxtwitter 回應
     * @param {string} tid - 推文 ID
     * @returns {Object|null}
     */
    normalizeVxTwitterResponse(data, tid) {
        return normalizer.normalizeVxTwitterResponse(data, tid);
    }

    /**
     * 獲取被引用推文的資訊
     */
    getQuoteTweetInfo(tweet) {
        return tweetInfo.getQuoteTweetInfo(tweet);
    }

    /**
     * 獲取被回覆推文的資訊
     */
    async getReplyTweetInfo(tweet) {
        try {
            const { replyTweetId, replyUsername } = tweetInfo.getReplyReference(tweet);

            // LOG removed for simplicity

            // 獲取原文推文
            let replyTweet = null;
            if (replyTweetId) {
                try {
                    // LOG removed for simplicity
                    const replyResp = await this.httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${replyTweetId}`, {
                        timeout: 2500
                    });

                    if (replyResp && replyResp.tweet) {
                        replyTweet = replyResp.tweet;
                        // LOG removed for simplicity
                    }
                } catch (error) {
                    // LOG removed for simplicity
                }
            }

            return {
                username: replyUsername,
                tweetId: replyTweetId,
                tweet: replyTweet
            };

        } catch (error) {
            // LOG removed for simplicity
            return null;
        }
    }

    /**
     * 建立增強版嵌入式訊息
     * @param {Object} showQuote - 是否顯示引用原文 (預設 true 保持向後兼容)
     */
    buildEnhancedEmbed(tweet, originalURL, replyInfo, tweetType, quoteInfo, showQuote = true) {
        const embed = new EmbedBuilder();
        embed.setColor(0x1DA1F2);

        // 設定 Author 資訊：用戶ID、頭像、個人頁面
        try {
            embed.setAuthor({
                name: `@${tweet.author.screen_name}`, // 用戶的實際ID
                iconURL: tweet.author.profile_image_url_https || tweet.author.avatar_url, // 用戶頭像
                url: `https://twitter.com/${tweet.author.screen_name}` // 用戶個人頁面
            });

            // LOG removed for simplicity
        } catch (error) {
            // LOG removed for simplicity
        }

        // 設定標題：只顯示用戶暱稱
        try {
            const displayName = tweet.author.name || tweet.author.screen_name;
            embed.setTitle(displayName); // 只顯示暱稱，不加括號和ID
            embed.setURL(originalURL); // 點擊標題跳轉到推文

            // LOG removed for simplicity
        } catch (error) {
            // LOG removed for simplicity
        }

        // 設定描述：顯示推文內容（智能截斷），但不顯示推文類型描述
        // 📝 儲存截斷資訊供按鈕使用
        let truncationResult = null;

        try {
            let description = '';

            // 顯示推文內容（帶字數限制）
            if (tweet.text) {
                truncationResult = this.textTruncator.processTweetContent(tweet.text, '主推文');
                description = truncationResult.text;
                // LOG removed for simplicity
            }

            // 🔒 等級 2：內文防爆雷
            const blacklistEntry = tweet._blacklistEntry;
            if (blacklistEntry && blacklistEntry.level === 2 && description) {
                description = `||${description}||`;
            }

            // 不再添加推文類型描述 (如 "@用戶 回覆了一篇推文")
            // 推文類型資訊已移到 Footer 中顯示

            if (description) {
                embed.setDescription(description);
            }
        } catch (error) {
            // LOG removed for simplicity
        }

        // 回覆推文處理：移除引用原文顯示，只顯示回覆者自己的內容
        // (原文內容已被移除，回覆推文將不顯示被回覆的原文)
        try {
            if (replyInfo && replyInfo.tweet) {
                // LOG removed for simplicity
            } else if (replyInfo && replyInfo.username) {
                // LOG removed for simplicity
            }
        } catch (error) {
            // LOG removed for simplicity
        }

        // 如果有引用資訊且 showQuote 為 true，添加被引用推文 Field
        try {
            if (quoteInfo && quoteInfo.tweet && showQuote) {
                const quoteTweet = quoteInfo.tweet;
                const quoteUsername = quoteTweet.author.screen_name; // 用戶ID
                const quoteDisplayName = quoteTweet.author.name || quoteTweet.author.screen_name; // 用戶暱稱

                // 處理被引用推文內容 - 智能截斷並使用全形空白處理空白行
                const rawQuoteContent = quoteTweet.text || '引用內容';
                const quoteTruncationResult = this.textTruncator.processTweetContent(rawQuoteContent, '引用推文');
                const truncatedQuoteContent = quoteTruncationResult.text;

                // 將內容按行分割，每行都加上 > 前綴，空白行使用全形空白
                const quotedContent = truncatedQuoteContent
                    .split('\n')
                    .map(line => {
                        if (line.trim() === '') {
                            return '> 　'; // 全形空白
                        } else {
                            return `> ${line}`;
                        }
                    })
                    .join('\n');

                // 🔧 添加被引用推文 Field - 新格式: [RT](引用原文): 暱稱 ([@用戶ID](個人頁面))
                const fieldName = '\u200B'; // 零寬度空格
                const quotedTweetURL = `https://twitter.com/${quoteUsername}/status/${quoteInfo.tweetId}`;
                const authorProfileURL = `https://twitter.com/${quoteUsername}`;
                const fieldValue = `> [RT](${quotedTweetURL}): ${quoteDisplayName} ([@${quoteUsername}](${authorProfileURL}))\n> 　\n${quotedContent}`;

                embed.addFields({
                    name: fieldName,
                    value: fieldValue,
                    inline: false
                });

                // LOG removed for simplicity
            }
        } catch (error) {
            // LOG removed for simplicity
        }

        // 設定圖片（根據新的規則）
        try {
            this.setEmbedImages(embed, tweet, replyInfo, tweetType, quoteInfo);
        } catch (error) {
            // LOG removed for simplicity
        }

        // 設定時間戳
        try {
            if (tweet.created_at) {
                embed.setTimestamp(new Date(tweet.created_at));
            }
        } catch (error) {
            // LOG removed for simplicity
        }

        // 設定 Footer（包含推文類型標示）
        try {
            const stats = [];
            if (tweet.likes) stats.push(`❤️ ${tweet.likes}`);
            if (tweet.retweets) stats.push(`🔄 ${tweet.retweets}`);
            if (tweet.replies) stats.push(`💬 ${tweet.replies}`);

            // 決定推文類型標示
            let tweetTypeLabel = '';
            if (replyInfo && replyInfo.username) {
                tweetTypeLabel = '回覆文章 ';
                // LOG removed for simplicity
            } else if (quoteInfo && quoteInfo.tweet) {
                tweetTypeLabel = '轉推文章 ';
                // LOG removed for simplicity
            } else {
                tweetTypeLabel = '';
                // LOG removed for simplicity
            }

            // 🔒 處理黑名單 Footer
            const blacklistEntry = tweet._blacklistEntry;
            let footerText = '';

            if (blacklistEntry && (blacklistEntry.level === 1 || blacklistEntry.level === 2)) {
                // 等級 1 或 2：修改 Footer 警告
                footerText = `${blacklistEntry.label}，觀看內文請自行斟酌`;
            } else {
                // 正常情況
                if (stats.length > 0) {
                    footerText = `${stats.join(' • ')} | ${tweetTypeLabel}Peko Embed`;
                } else {
                    footerText = `${tweetTypeLabel}Peko Embed`;
                }
            }

            embed.setFooter({
                text: footerText,
                iconURL: 'https://abs.twimg.com/favicons/twitter.2.ico'
            });
        } catch (error) {
            // LOG removed for simplicity
        }

        // 返回 embed 和 truncationResult（供展開按鈕使用）
        return {
            embed: embed,
            truncationResult: truncationResult
        };
    }

    /**
     * 設定嵌入式訊息圖片（根據新規則）
     */
    setEmbedImages(embed, tweet, replyInfo, tweetType, quoteInfo) {
        // 新規則：
        // 1. 回覆推文：只顯示回覆推文本身的圖片，完全不顯示被回覆原文的圖片
        // 2. 引用轉推：優先顯示轉推者的圖片，被引用推文圖片在Field中
        // 3. 非回覆/非引用推文：正常顯示推文圖片

        const tweetImages = this.extractImagesFromTweet(tweet);
        const replyImages = replyInfo && replyInfo.tweet ? this.extractImagesFromTweet(replyInfo.tweet) : [];
        const quoteImages = quoteInfo && quoteInfo.tweet ? this.extractImagesFromTweet(quoteInfo.tweet) : [];

        let primaryImage = null;

        if (replyInfo && replyInfo.tweet) {
            // 這是回覆推文 - 只顯示回覆推文本身的圖片，不顯示被回覆原文的圖片
            if (tweetImages.length > 0) {
                // 回覆推文有圖片，只顯示回覆推文的圖片
                primaryImage = tweetImages[0].url;
                // LOG removed for simplicity
            }
            // 移除：不再顯示被回覆原文的圖片
        } else if (quoteInfo && quoteInfo.tweet) {
            // 這是引用轉推
            if (tweetImages.length > 0) {
                // 轉推者有圖片，優先顯示
                primaryImage = tweetImages[0].url;
                // LOG removed for simplicity
                if (quoteImages.length > 0) {
                    // LOG removed for simplicity
                }
            } else if (quoteImages.length > 0) {
                // 只有被引用推文有圖片
                primaryImage = quoteImages[0].url;
                // LOG removed for simplicity
            }
        } else {
            // 非回覆/非引用推文，正常處理
            if (tweetImages.length > 0) {
                primaryImage = tweetImages[0].url;
                // LOG removed for simplicity
            }
        }

        if (primaryImage) {
            // 🔒 等級 2：圖片防爆雷
            const blacklistEntry = tweet._blacklistEntry;
            if (blacklistEntry && blacklistEntry.level === 2) {
                embed.setImage(`SPOILER_${primaryImage}`);
            } else {
                embed.setImage(primaryImage);
            }
        }
    }

    /**
     * 從推文中提取圖片
     */
    extractImagesFromTweet(tweet) {
        return imageHelpers.extractImagesFromTweet(tweet);
    }

    /**
     * 建立分頁按鈕（針對多圖片推文和混合媒體）
     */
    buildPaginationButtons(tweet, tweetType) {
        return classicComponents.buildPaginationButtons(tweet, tweetType, item => this.extractImagesFromTweet(item));
    }

    /**
     * 建立顯示全文切換按鈕組件（返回 ButtonBuilder）
     * @param {string} tweetId - 推文 ID
     * @param {boolean} isExpanded - 是否已展開狀態
     * @returns {ButtonBuilder}
     */
    buildExpandToggleButtonComponent(tweetId, isExpanded) {
        return classicComponents.buildExpandToggleButtonComponent(tweetId, isExpanded);
    }

    /**
     * 建立統一展開/收回按鈕組件（整合引用、回覆、全文）
     * @param {string} tweetId - 推文 ID
     * @param {boolean} isAllExpanded - 是否已全部展開
     * @returns {ButtonBuilder}
     */
    buildAllToggleButtonComponent(tweetId, isAllExpanded) {
        return classicComponents.buildAllToggleButtonComponent(tweetId, isAllExpanded);
    }

    /**
     * 建立 AI 翻譯按鈕組件
     * @param {string} tweetId - 推文 ID
     * @param {boolean} isTranslated - 是否已翻譯狀態
     * @returns {ButtonBuilder}
     */
    buildTranslateButtonComponent(tweetId, isTranslated) {
        return classicComponents.buildTranslateButtonComponent(tweetId, isTranslated);
    }

    /**
     * 為 components 添加翻譯按鈕
     * @param {Array|null} components - 現有的 components 陣列
     * @param {Object} tweet - 推文物件
     * @returns {Array|null} 更新後的 components
     */
    addTranslateButtonToComponents(components, tweet) {
        return classicComponents.addTranslateButtonToComponents(
            components,
            tweet,
            (tweetId, isTranslated) => this.buildTranslateButtonComponent(tweetId, isTranslated)
        );
    }

    /**
     * 格式化影片 URLs 為連結格式
     */
    formatVideoUrls(videoUrls) {
        return videoLinks.formatVideoUrls(videoUrls);
    }

    /**
     * 提取視頻 URL
     * 2026-04-11: 若有設定 Vercel embed，單影片推文改用 Vercel embed URL
     */
    extractVideoUrls(tweet) {
        return videoLinks.extractVideoUrls(tweet, url => this.videoLinkFormat(url));
    }

    /**
     * 視頻連結格式化
     */
    videoLinkFormat(videoUrl) {
        return videoLinks.videoLinkFormat(videoUrl);
    }


    /**
     * 🆕 處理個人資料頁面
     * @param {string} username - Twitter 用戶名
     * @param {string} originalURL - 原始 URL
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async handleProfileExtraction(username, originalURL, message = null) {
        try {
            // 調用 fxtwitter API 獲取用戶資料
            const apiURL = `https://api.fxtwitter.com/${username}`;
            const response = await this.httpClient.fetchJSON(apiURL, {
                timeout: 5000
            });

            if (!response || !response.user) {
                tfd.sysError('Twitter-Extractor', `🔍 用戶資料 API 請求失敗診斷 | Username: ${username} | URL: ${apiURL} | 回應內容: ${JSON.stringify(response).substring(0, 500)}`);
                throw new Error('無法獲取用戶資料');
            }

            const user = response.user;

            // 建立個人資料 embed
            const embed = this.buildProfileEmbed(user, originalURL);

            // 記錄網址轉換
            URLConverterLogger.logConversion('twitter', message, `個人資料: @${username}`);

            return {
                success: true,
                embed: embed,
                siteName: 'twitter',
                contentType: 'profile',
                profileData: user
            };

        } catch (error) {
            tfd.sysError('Twitter-Profile', `處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 🆕 建立個人資料 embed
     * @param {Object} user - fxtwitter API 返回的用戶資料
     * @param {string} originalURL - 原始 URL
     * @returns {EmbedBuilder}
     */
    buildProfileEmbed(user, originalURL) {
        return responseBuilders.buildProfileEmbed(user, originalURL);
    }

    /**
     * 創建通過響應（已是 fixupx.com）
     */
    createPassthroughResponse(originalURL) {
        return responseBuilders.createPassthroughResponse(originalURL);
    }

    /**
     * 創建錯誤響應
     */
    createErrorResponse(errorMessage, originalURL) {
        return responseBuilders.createErrorResponse(errorMessage, originalURL);
    }
}

TFDTwitterExtractor.prototype.buildReloadButtonComponent = function(tweetId) {
    return classicComponents.buildReloadButtonComponent(tweetId);
};

module.exports = TFDTwitterExtractor;
