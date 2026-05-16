/**
 * Twitter 統一展開/收回按鈕互動處理器
 * 一鍵展開全部（引用 + 回覆 + 全文）/ 一鍵收回全部
 * 對應按鈕 ID: twitter_expand_all_{tweetId} / twitter_collapse_all_{tweetId}
 */

const { ActionRowBuilder, MessageFlags } = require('discord.js');
const { getTranslationState } = require('./translation');
const { getCachedContent } = require('../../translation/cache/content-cache');
const tlog = require('../../../../utils/tfd-logger');

/**
 * 處理 Twitter 統一展開/收回按鈕互動
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleTwitterAllToggleInteraction(interaction) {
    try {
        const customId = interaction.customId;
        let isExpanding, tweetId;

        if (customId.startsWith('twitter_expand_all_')) {
            isExpanding = true;
            tweetId = customId.replace('twitter_expand_all_', '');
        } else if (customId.startsWith('twitter_collapse_all_')) {
            isExpanding = false;
            tweetId = customId.replace('twitter_collapse_all_', '');
        } else {
            return false;
        }

        await interaction.deferUpdate();

        const message = interaction.message;
        if (!message || !message.embeds || message.embeds.length === 0) {
            await interaction.followUp({
                content: '❌ 無法找到推文內容',
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        // 從 API 取得最新推文資料（引用/回覆需要完整內容）
        const HTTPClient = require('../../../../tfd-system/utils/http-client');
        const httpClient = new HTTPClient();
        let tweet = null;
        try {
            const resp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, { timeout: 5000 });
            if (resp && resp.tweet) tweet = resp.tweet;
        } catch (e) {
            tlog.sysError('TwitterAllToggle', `API 獲取失敗: ${e.message}`);
        }

        const TFDTwitterExtractor = require('../extractors/twitter-v2-extractor');
        const extractor = new TFDTwitterExtractor();
        const TextTruncator = require('../../../shared/discord/text-truncator.js');
        const truncator = new TextTruncator();

        const translationState = getTranslationState(tweetId);
        const isTranslated = translationState && translationState.isTranslated;

        // 複製原始 embed（修改用）
        const originalEmbed = message.embeds[0].toJSON();
        let expandedImages = [];

        if (isExpanding) {
            // ══════════════════════════════
            // 展開邏輯
            // ══════════════════════════════
            if (!tweet) {
                await interaction.followUp({
                    content: '❌ 無法取得推文資料，請稍後再試',
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }

            // 1. 展開引用推文
            const quoteInfo = extractor.getQuoteTweetInfo(tweet);
            if (quoteInfo && quoteInfo.tweet) {
                const quoteTweet = quoteInfo.tweet;
                const quoteUsername = quoteTweet.author.screen_name;
                const quoteDisplayName = quoteTweet.author.name || quoteUsername;

                let displayContent = quoteTweet.text || '引用內容';

                // 翻譯狀態下使用翻譯快取
                if (isTranslated && translationState.translatedQuoteText) {
                    displayContent = translationState.translatedQuoteText;
                }

                const truncResult = truncator.processTweetContent(displayContent, '引用推文');
                const quotedContent = truncResult.text
                    .split('\n')
                    .map(l => l.trim() === '' ? '> \u3000' : `> ${l}`)
                    .join('\n');

                const quotedTweetURL = `https://twitter.com/${quoteUsername}/status/${quoteInfo.tweetId}`;
                const authorURL = `https://twitter.com/${quoteUsername}`;
                const fieldValue = `> [RT](${quotedTweetURL}): ${quoteDisplayName} ([@${quoteUsername}](${authorURL}))\n> \u3000\n${quotedContent}`;

                if (!originalEmbed.fields) originalEmbed.fields = [];
                // 移除已有的引用 field（避免重複）
                originalEmbed.fields = originalEmbed.fields.filter(f =>
                    !f.value.includes('[RT](https://twitter.com/')
                );
                originalEmbed.fields.push({ name: '\u200B', value: fieldValue, inline: false });

                // 引用推文圖片（優先使用）
                const qImgs = extractor.extractImagesFromTweet(quoteTweet);
                if (qImgs.length > 0) expandedImages = qImgs;
            }

            // 2. 展開回覆推文
            const replyInfo = await extractor.getReplyTweetInfo(tweet);
            if (replyInfo && replyInfo.tweet) {
                const replyTweet = replyInfo.tweet;
                const replyUsername = replyTweet.author.screen_name;
                const replyDisplayName = replyTweet.author.name || replyUsername;

                let displayContent = replyTweet.text || '回覆內容';

                // 翻譯狀態下使用翻譯快取
                if (isTranslated && translationState.translatedReplyText) {
                    displayContent = translationState.translatedReplyText;
                }

                const truncResult = truncator.processTweetContent(displayContent, '回覆推文');
                const repliedContent = truncResult.text
                    .split('\n')
                    .map(l => l.trim() === '' ? '> \u3000' : `> ${l}`)
                    .join('\n');

                const repliedTweetURL = `https://twitter.com/${replyUsername}/status/${replyInfo.tweetId}`;
                const authorURL = `https://twitter.com/${replyUsername}`;
                const fieldValue = `> [↩️ 回覆](${repliedTweetURL}): ${replyDisplayName} ([@${replyUsername}](${authorURL}))\n> \u3000\n${repliedContent}`;

                if (!originalEmbed.fields) originalEmbed.fields = [];
                // 移除已有的回覆 field（避免重複）
                originalEmbed.fields = originalEmbed.fields.filter(f =>
                    !f.value.includes('[↩️ 回覆](https://twitter.com/')
                );
                originalEmbed.fields.push({ name: '\u200B', value: fieldValue, inline: false });

                // 回覆推文圖片（引用已有圖片時不覆蓋）
                if (expandedImages.length === 0) {
                    const rImgs = extractor.extractImagesFromTweet(replyTweet);
                    if (rImgs.length > 0) expandedImages = rImgs;
                }
            }

            // 3. 展開全文
            let textToUse = null;
            if (isTranslated) {
                textToUse = translationState?.translatedFullText || null;
                // 沒有翻譯完整文字快取則略過文字展開
            } else {
                textToUse = getCachedContent(tweetId)
                    || translationState?.originalFullText
                    || tweet?.text
                    || null;
            }

            if (textToUse) {
                const truncResult = truncator.truncateText(textToUse);
                if (truncResult.isTruncated) {
                    let newDescription = textToUse.length > 4086
                        ? textToUse.slice(0, 4084) + '\n…'
                        : textToUse;
                    const hasSpoiler = (originalEmbed.description || '').startsWith('||')
                        && (originalEmbed.description || '').endsWith('||');
                    if (hasSpoiler) newDescription = `||${newDescription}||`;
                    originalEmbed.description = newDescription;
                }
            }

        } else {
            // ══════════════════════════════
            // 收回邏輯
            // ══════════════════════════════

            // 1. 移除引用 + 回覆 fields
            if (originalEmbed.fields) {
                originalEmbed.fields = originalEmbed.fields.filter(f =>
                    !f.value.includes('[RT](https://twitter.com/') &&
                    !f.value.includes('[↩️ 回覆](https://twitter.com/')
                );
            }

            // 2. 收起全文（截回）
            let textToUse = null;
            if (isTranslated) {
                textToUse = translationState?.translatedFullText || null;
            } else {
                textToUse = getCachedContent(tweetId)
                    || translationState?.originalFullText
                    || null;
            }

            if (textToUse) {
                const truncResult = truncator.truncateText(textToUse);
                if (truncResult.isTruncated) {
                    let newDescription = truncResult.truncatedText;
                    const hasSpoiler = (originalEmbed.description || '').startsWith('||')
                        && (originalEmbed.description || '').endsWith('||');
                    if (hasSpoiler) newDescription = `||${newDescription}||`;
                    originalEmbed.description = newDescription;
                }
            }

            // 3. 恢復主推文圖片
            if (tweet) {
                const mainImages = extractor.extractImagesFromTweet(tweet);
                if (mainImages.length > 0) {
                    originalEmbed.image = { url: mainImages[0].url };
                } else {
                    delete originalEmbed.image;
                }
            }
        }

        // ══════════════════════════════
        // 建構 embeds 陣列
        // ══════════════════════════════
        const allEmbeds = [originalEmbed];
        if (expandedImages.length > 0) {
            originalEmbed.image = { url: expandedImages[0].url };
            const embedUrl = originalEmbed.url || `https://twitter.com/i/status/${tweetId}`;
            for (let i = 1; i < expandedImages.length; i++) {
                allEmbeds.push({ url: embedUrl, image: { url: expandedImages[i].url } });
            }
        } else if (isExpanding && message.embeds.length > 1) {
            // 展開但無新圖片：保留原有額外 embeds
            for (let i = 1; i < message.embeds.length; i++) {
                allEmbeds.push(message.embeds[i].toJSON());
            }
        }

        // ══════════════════════════════
        // 更新按鈕狀態
        // ══════════════════════════════
        const existingComponents = message.components || [];
        const newComponents = [...existingComponents];

        const toggleRowIndex = existingComponents.findIndex(row =>
            row.components && row.components.some(btn =>
                btn.customId && (
                    btn.customId.startsWith('twitter_expand_all_') ||
                    btn.customId.startsWith('twitter_collapse_all_')
                )
            )
        );

        if (toggleRowIndex !== -1) {
            const existingRow = existingComponents[toggleRowIndex];
            const newButtons = existingRow.components.map(btn => {
                if (btn.customId && (
                    btn.customId.startsWith('twitter_expand_all_') ||
                    btn.customId.startsWith('twitter_collapse_all_')
                )) {
                    return extractor.buildAllToggleButtonComponent(tweetId, isExpanding);
                }
                return btn;
            });
            newComponents[toggleRowIndex] = new ActionRowBuilder().addComponents(...newButtons);
        }

        await interaction.editReply({ embeds: allEmbeds, components: newComponents });
        return true;

    } catch (error) {
        tlog.sysError('TwitterAllToggle', `處理失敗: ${error}`);
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
        } catch (e) {
            tlog.sysError('TwitterAllToggle', `回應失敗: ${e}`);
        }
        return false;
    }
}

module.exports = { handleTwitterAllToggleInteraction };
