/**
 * Twitter 引用/回覆推文切換按鈕互動處理器
 * 處理「展開引用」「收起引用」「展開回覆」「收起回覆」按鈕
 */

const { ActionRowBuilder, MessageFlags } = require('discord.js');

// 引入翻译相关模块
const { getTranslationState, setTranslationState } = require('./twitter-translate-interactions.js');
const { getCachedContent } = require('./content-translation-interactions.js');
const { getInstance: getApiKeyService } = require('../utils/user-api-key-service.js');
const { getInstance: getGeminiTranslator } = require('../utils/gemini-translator.js');

/**
 * 處理 Twitter 引用/回覆推文切換按鈕互動
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleTwitterQuoteInteraction(interaction) {
    try {
        const customId = interaction.customId;

        // 解析 customId: twitter_show_quote_{tweetId} / twitter_hide_quote_{tweetId}
        //                  twitter_show_reply_{tweetId} / twitter_hide_reply_{tweetId}
        let isShowing = false;
        let isQuote = false; // true = quote, false = reply
        let tweetId = null;

        if (customId.startsWith('twitter_show_quote_')) {
            isShowing = true;
            isQuote = true;
            tweetId = customId.replace('twitter_show_quote_', '');
        } else if (customId.startsWith('twitter_hide_quote_')) {
            isShowing = false;
            isQuote = true;
            tweetId = customId.replace('twitter_hide_quote_', '');
        } else if (customId.startsWith('twitter_show_reply_')) {
            isShowing = true;
            isQuote = false;
            tweetId = customId.replace('twitter_show_reply_', '');
        } else if (customId.startsWith('twitter_hide_reply_')) {
            isShowing = false;
            isQuote = false;
            tweetId = customId.replace('twitter_hide_reply_', '');
        } else {
            return false;
        }

        const typeLabel = isQuote ? '引用' : '回覆';

        // ⚡ 立即 defer（避免 API 呼叫超過 3 秒限制）
        await interaction.deferUpdate();

        // 獲取原始訊息
        const message = interaction.message;
        if (!message || !message.embeds || message.embeds.length === 0) {
            await interaction.followUp({
                content: '❌ 無法找到推文內容',
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        // 從 API 獲取推文資料（需要引用/回覆的完整內容）
        const HTTPClient = require('../tfd-system/utils/http-client');
        const httpClient = new HTTPClient();

        let tweet = null;
        try {
            const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                timeout: 5000
            });
            if (fxapiResp && fxapiResp.tweet) {
                tweet = fxapiResp.tweet;
            }
        } catch (fetchError) {
            console.error(`[Twitter${typeLabel}切換] API 獲取失敗:`, fetchError.message);
        }

        // 獲取原始 embed 的 JSON
        const originalEmbed = message.embeds[0].toJSON();

        // 🖼️ 圖片切換：展開時顯示引用/回覆推文的圖片，收起時恢復
        const ImageExtractorClass = require('../tfd-system/extractors/twitter-v2.js');
        const imgExtractor = new ImageExtractorClass();
        let expandedImages = []; // 展開時要顯示的目標推文圖片

        if (isShowing && tweet) {
            // 展開：添加引用/回覆內容到 embed fields
            const TFDTwitterExtractor = require('../tfd-system/extractors/twitter-v2.js');
            const extractor = new TFDTwitterExtractor();

            // 檢查當前是否處於翻譯狀態
            const translationState = getTranslationState(tweetId);
            const isTranslated = translationState && translationState.isTranslated;

            if (isQuote) {
                // 取得引用推文資訊
                const quoteInfo = extractor.getQuoteTweetInfo(tweet);
                if (quoteInfo && quoteInfo.tweet) {
                    const quoteTweet = quoteInfo.tweet;
                    const quoteUsername = quoteTweet.author.screen_name;
                    const quoteDisplayName = quoteTweet.author.name || quoteUsername;

                    // 處理引用推文內容
                    const TextTruncator = require('../tfd-system/utils/text-truncator.js');
                    const truncator = new TextTruncator();
                    const rawQuoteContent = quoteTweet.text || '引用內容';
                    
                    // 如果處於翻譯狀態，需要翻譯引用推文
                    let displayContent = rawQuoteContent;
                    if (isTranslated) {
                        console.log(`[Twitter引用切換] 當前為翻譯狀態，正在翻譯引用推文: ${quoteInfo.tweetId}`);
                        
                        // 檢查是否已有引用推文的翻譯快取
                        let translatedQuoteText = translationState.translatedQuoteText;
                        
                        if (!translatedQuoteText) {
                            // 沒有快取，需要翻譯
                            translatedQuoteText = await translateQuoteTweet(
                                quoteTweet, 
                                translationState, 
                                tweetId,
                                interaction.user.id
                            );
                        }
                        
                        if (translatedQuoteText) {
                            displayContent = translatedQuoteText;
                        }
                    }
                    
                    const quoteTruncationResult = truncator.processTweetContent(displayContent, '引用推文');
                    const truncatedQuoteContent = quoteTruncationResult.text;

                    // 格式化引用內容（每行加 > 前綴）
                    const quotedContent = truncatedQuoteContent
                        .split('\n')
                        .map(line => {
                            if (line.trim() === '') {
                                return '> \u3000'; // 全形空白
                            }
                            return `> ${line}`;
                        })
                        .join('\n');

                    const quotedTweetURL = `https://twitter.com/${quoteUsername}/status/${quoteInfo.tweetId}`;
                    const authorProfileURL = `https://twitter.com/${quoteUsername}`;
                    const fieldValue = `> [RT](${quotedTweetURL}): ${quoteDisplayName} ([@${quoteUsername}](${authorProfileURL}))\n> \u3000\n${quotedContent}`;

                    // 添加引用 field（使用零寬度空格作為 field name）
                    if (!originalEmbed.fields) originalEmbed.fields = [];

                    // 移除已有的引用 field（避免重複）
                    originalEmbed.fields = originalEmbed.fields.filter(f =>
                        !f.value.includes('[RT](https://twitter.com/')
                    );

                    originalEmbed.fields.push({
                        name: '\u200B',
                        value: fieldValue,
                        inline: false
                    });

                    // 🖼️ 提取引用推文的圖片
                    const quoteImgs = imgExtractor.extractImagesFromTweet(quoteTweet);
                    if (quoteImgs.length > 0) {
                        expandedImages = quoteImgs;
                    }
                }
            } else {
                // 取得回覆推文資訊
                const replyInfo = await extractor.getReplyTweetInfo(tweet);
                if (replyInfo && replyInfo.tweet) {
                    const replyTweet = replyInfo.tweet;
                    const replyUsername = replyTweet.author.screen_name;
                    const replyDisplayName = replyTweet.author.name || replyUsername;

                    const TextTruncator = require('../tfd-system/utils/text-truncator.js');
                    const truncator = new TextTruncator();
                    const rawReplyContent = replyTweet.text || '回覆內容';
                    
                    // 如果處於翻譯狀態，需要翻譯回覆推文
                    let displayContent = rawReplyContent;
                    if (isTranslated) {
                        console.log(`[Twitter回覆切換] 當前為翻譯狀態，正在翻譯回覆推文: ${replyInfo.tweetId}`);
                        
                        // 檢查是否已有回覆推文的翻譯快取
                        let translatedReplyText = translationState.translatedReplyText;
                        
                        if (!translatedReplyText) {
                            // 沒有快取，需要翻譯
                            translatedReplyText = await translateReplyTweet(
                                replyTweet, 
                                translationState, 
                                tweetId,
                                interaction.user.id
                            );
                        }
                        
                        if (translatedReplyText) {
                            displayContent = translatedReplyText;
                        }
                    }
                    
                    const replyTruncationResult = truncator.processTweetContent(displayContent, '回覆推文');
                    const truncatedReplyContent = replyTruncationResult.text;

                    const repliedContent = truncatedReplyContent
                        .split('\n')
                        .map(line => {
                            if (line.trim() === '') {
                                return '> \u3000';
                            }
                            return `> ${line}`;
                        })
                        .join('\n');

                    const repliedTweetURL = `https://twitter.com/${replyUsername}/status/${replyInfo.tweetId}`;
                    const authorProfileURL = `https://twitter.com/${replyUsername}`;
                    const fieldValue = `> [↩️ 回覆](${repliedTweetURL}): ${replyDisplayName} ([@${replyUsername}](${authorProfileURL}))\n> \u3000\n${repliedContent}`;

                    if (!originalEmbed.fields) originalEmbed.fields = [];

                    // 移除已有的回覆 field
                    originalEmbed.fields = originalEmbed.fields.filter(f =>
                        !f.value.includes('[↩️ 回覆](https://twitter.com/')
                    );

                    originalEmbed.fields.push({
                        name: '\u200B',
                        value: fieldValue,
                        inline: false
                    });

                    // 🖼️ 提取回覆原文的圖片
                    const replyImgs = imgExtractor.extractImagesFromTweet(replyTweet);
                    if (replyImgs.length > 0) {
                        expandedImages = replyImgs;
                    }
                }
            }
        } else if (!isShowing) {
            // 收起：移除引用/回覆的 field
            if (originalEmbed.fields) {
                if (isQuote) {
                    originalEmbed.fields = originalEmbed.fields.filter(f =>
                        !f.value.includes('[RT](https://twitter.com/')
                    );
                } else {
                    originalEmbed.fields = originalEmbed.fields.filter(f =>
                        !f.value.includes('[↩️ 回覆](https://twitter.com/')
                    );
                }
            }

            // 🖼️ 收起時恢復主推文的圖片
            if (tweet) {
                const mainImages = imgExtractor.extractImagesFromTweet(tweet);
                if (isQuote) {
                    const qi = imgExtractor.getQuoteTweetInfo(tweet);
                    const qImgs = qi?.tweet ? imgExtractor.extractImagesFromTweet(qi.tweet) : [];
                    if (mainImages.length > 0) {
                        originalEmbed.image = { url: mainImages[0].url };
                    } else if (qImgs.length > 0) {
                        originalEmbed.image = { url: qImgs[0].url };
                    } else {
                        delete originalEmbed.image;
                    }
                } else {
                    // 回覆推文：只恢復主推文自己的圖片
                    if (mainImages.length > 0) {
                        originalEmbed.image = { url: mainImages[0].url };
                    } else {
                        delete originalEmbed.image;
                    }
                }
            }
        }

        // 🖼️ 構建 embeds 陣列（處理圖片切換）
        const allEmbeds = [originalEmbed];
        if (expandedImages.length > 0) {
            // 展開狀態：顯示引用/回覆推文的所有圖片
            originalEmbed.image = { url: expandedImages[0].url };
            const embedUrl = originalEmbed.url || `https://twitter.com/i/status/${tweetId}`;
            for (let i = 1; i < expandedImages.length; i++) {
                allEmbeds.push({
                    url: embedUrl,
                    image: { url: expandedImages[i].url }
                });
            }
        } else if (isShowing) {
            // 展開但目標推文無圖：保留原有的額外 embeds
            if (message.embeds.length > 1) {
                for (let i = 1; i < message.embeds.length; i++) {
                    allEmbeds.push(message.embeds[i].toJSON());
                }
            }
        }
        // 收起狀態：只保留主 embed（圖片已在上面恢復，不需要額外圖片 embeds）

        // 更新按鈕狀態
        const existingComponents = message.components || [];
        const newComponents = [...existingComponents];

        const TFDTwitterExtractor = require('../tfd-system/extractors/twitter-v2.js');
        const extractor = new TFDTwitterExtractor();

        // 找到包含切換按鈕的 ActionRow
        const toggleRowIndex = existingComponents.findIndex(row =>
            row.components && row.components.some(btn =>
                btn.customId && (
                    btn.customId.includes('show_quote') || btn.customId.includes('hide_quote') ||
                    btn.customId.includes('show_reply') || btn.customId.includes('hide_reply') ||
                    btn.customId.startsWith('twitter_expand_') || btn.customId.startsWith('twitter_collapse_') ||
                    btn.customId.startsWith('twitter_translate_') || btn.customId.startsWith('twitter_original_')
                )
            )
        );

        if (toggleRowIndex !== -1) {
            const existingRow = existingComponents[toggleRowIndex];
            const newButtons = existingRow.components.map(btn => {
                // 更新引用按鈕
                if (isQuote && btn.customId && (btn.customId.includes('show_quote') || btn.customId.includes('hide_quote'))) {
                    return extractor.buildQuoteToggleButtonComponent(tweetId, isShowing);
                }
                // 更新回覆按鈕
                if (!isQuote && btn.customId && (btn.customId.includes('show_reply') || btn.customId.includes('hide_reply'))) {
                    return extractor.buildReplyToggleButtonComponent(tweetId, isShowing);
                }
                return btn;
            });
            newComponents[toggleRowIndex] = new ActionRowBuilder().addComponents(...newButtons);
        }

        // 更新訊息（已 deferUpdate，使用 editReply）
        await interaction.editReply({
            embeds: allEmbeds,
            components: newComponents
        });


        return true;

    } catch (error) {
        console.error('[Twitter引用/回覆切換] 處理失敗:', error);

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: '❌ 處理失敗，請稍後再試',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: '❌ 處理失敗，請稍後再試',
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (replyError) {
            console.error('[Twitter引用/回覆切換] 回應失敗:', replyError);
        }

        return false;
    }
}

/**
 * 翻译引用推文
 * @param {Object} quoteTweet - 引用推文物件
 * @param {Object} translationState - 翻译状态
 * @param {string} mainTweetId - 主推文 ID
 * @param {string} userId - 用户 ID
 * @returns {Promise<string|null>} 翻译后的文本
 */
async function translateQuoteTweet(quoteTweet, translationState, mainTweetId, userId) {
    try {
        // 检查用户是否有 API Key
        const apiKeyService = getApiKeyService();
        const userApiKey = await apiKeyService.getApiKey(userId, 'gemini');

        if (!userApiKey) {
            console.log('[Twitter引用翻译] 用户没有 API Key，返回原文');
            return null;
        }

        // 执行翻译
        const geminiTranslator = getGeminiTranslator();
        const translateOptions = { targetLanguage: '繁體中文' };
        
        if (quoteTweet.author?.name) {
            translateOptions.authorName = quoteTweet.author.name;
        }

        const translateResult = await geminiTranslator.translateWithUserKey(
            quoteTweet.text || '',
            userApiKey,
            translateOptions
        );

        if (!translateResult.success) {
            console.error('[Twitter引用翻译] 翻译失败:', translateResult.errorType, translateResult.error);
            return null;
        }

        const translatedText = translateResult.text;

        // 更新翻译状态缓存
        translationState.translatedQuoteText = translatedText;
        setTranslationState(mainTweetId, translationState);

        console.log('[Twitter引用翻译] 翻译成功并已缓存');
        return translatedText;

    } catch (error) {
        console.error('[Twitter引用翻译] 翻译异常:', error);
        return null;
    }
}

/**
 * 翻译回覆推文
 * @param {Object} replyTweet - 回覆推文物件
 * @param {Object} translationState - 翻译状态
 * @param {string} mainTweetId - 主推文 ID
 * @param {string} userId - 用户 ID
 * @returns {Promise<string|null>} 翻译后的文本
 */
async function translateReplyTweet(replyTweet, translationState, mainTweetId, userId) {
    try {
        // 检查用户是否有 API Key
        const apiKeyService = getApiKeyService();
        const userApiKey = await apiKeyService.getApiKey(userId, 'gemini');

        if (!userApiKey) {
            console.log('[Twitter回覆翻译] 用户没有 API Key，返回原文');
            return null;
        }

        // 执行翻译
        const geminiTranslator = getGeminiTranslator();
        const translateOptions = { targetLanguage: '繁體中文' };
        
        if (replyTweet.author?.name) {
            translateOptions.authorName = replyTweet.author.name;
        }

        const translateResult = await geminiTranslator.translateWithUserKey(
            replyTweet.text || '',
            userApiKey,
            translateOptions
        );

        if (!translateResult.success) {
            console.error('[Twitter回覆翻译] 翻译失败:', translateResult.errorType, translateResult.error);
            return null;
        }

        const translatedText = translateResult.text;

        // 更新翻译状态缓存
        translationState.translatedReplyText = translatedText;
        setTranslationState(mainTweetId, translationState);

        console.log('[Twitter回覆翻译] 翻译成功并已缓存');
        return translatedText;

    } catch (error) {
        console.error('[Twitter回覆翻译] 翻译异常:', error);
        return null;
    }
}

module.exports = {
    handleTwitterQuoteInteraction
};
