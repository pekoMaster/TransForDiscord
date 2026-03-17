/**
 * Twitter 文字展開/收起按鈕互動處理器
 * 處理「顯示全文」和「收回全文」按鈕的切換功能
 */

const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

// 從 content-translation-interactions.js 引入快取系統
const { getCachedContent } = require('./content-translation-interactions.js');

// 從翻譯處理器引入翻譯狀態快取
const { getTranslationState } = require('./twitter-translate-interactions.js');

/**
 * 處理 Twitter 文字展開/收起按鈕互動
 * @param {import('discord.js').ButtonInteraction} interaction - Discord 按鈕互動
 * @returns {Promise<boolean>} 是否成功處理
 */
async function handleTwitterExpandInteraction(interaction) {
    try {
        const customId = interaction.customId;

        // 解析 customId
        let isExpanding = false;
        let tweetId = null;

        if (customId.startsWith('twitter_expand_')) {
            isExpanding = true;
            tweetId = customId.replace('twitter_expand_', '');
        } else if (customId.startsWith('twitter_collapse_')) {
            isExpanding = false;
            tweetId = customId.replace('twitter_collapse_', '');
        } else {
            console.warn(`[TwitterExpandInteraction] 未知的 customId: ${customId}`);
            return false;
        }

        // 獲取原始訊息
        const message = interaction.message;
        if (!message || !message.embeds || message.embeds.length === 0) {
            await interaction.reply({
                content: '❌ 無法找到推文內容',
                ephemeral: true
            });
            return true;
        }

        // 獲取原始 embed
        const originalEmbed = message.embeds[0];

        // 檢查是否為翻譯狀態（檢查 footer 是否有翻譯標記）
        const isTranslated = originalEmbed.footer?.text?.includes('🌐 AI 翻譯');

        // 獲取翻譯狀態快取
        const translationState = getTranslationState(tweetId);

        // 從快取中獲取完整文字（原文）
        let originalFullText = getCachedContent(tweetId);

        // 使用 TextTruncator 進行截斷處理
        const TextTruncator = require('../ermiana-system/utils/text-truncator.js');
        const truncator = new TextTruncator();

        // 決定要使用的文字（翻譯文字或原文）
        let textToUse;
        let needsAPIFetch = false;

        if (isTranslated) {
            // 翻譯狀態下
            if (translationState && translationState.translatedFullText) {
                // 有翻譯快取，使用翻譯後的完整文字
                textToUse = translationState.translatedFullText;
            } else {
                // 沒有翻譯快取，但 embed 是翻譯狀態
                // 使用當前 embed 的內容作為基礎（可能是截斷或完整的翻譯文字）
                const currentDescription = originalEmbed.description || '';

                if (isExpanding) {
                    // 展開時，如果當前是截斷的翻譯，無法取得完整翻譯
                    // 顯示提示訊息
                    await interaction.reply({
                        content: '⚠️ 翻譯快取已過期，無法展開完整翻譯內容。\n請點擊「原文」按鈕後重新翻譯。',
                        ephemeral: true
                    });
                    return true;
                } else {
                    // 收起時，使用當前內容（已經是翻譯文字）進行截斷
                    textToUse = currentDescription;
                }
            }
        } else {
            // 原文狀態下
            if (originalFullText) {
                textToUse = originalFullText;
            } else if (translationState && translationState.originalFullText) {
                textToUse = translationState.originalFullText;
            } else {
                needsAPIFetch = true;
            }
        }

        // 如果需要從 API 獲取原文
        if (needsAPIFetch) {
            try {
                const HTTPClient = require('../ermiana-system/utils/http-client');
                const httpClient = new HTTPClient();
                const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                    timeout: 5000
                });

                if (fxapiResp && fxapiResp.tweet && fxapiResp.tweet.text) {
                    textToUse = fxapiResp.tweet.text;
                }
            } catch (fetchError) {
                console.error(`[TwitterExpandInteraction] 從 API 獲取失敗:`, fetchError.message);
            }
        }

        if (!textToUse) {
            await interaction.reply({
                content: '❌ 推文內容已過期，請重新發送連結',
                ephemeral: true
            });
            return true;
        }

        let newDescription;
        // 創建新的展開/收起按鈕組件
        const ErmianaTwitterExtractor = require('../ermiana-system/extractors/twitter-v2.js');
        const extractor = new ErmianaTwitterExtractor();

        if (isExpanding) {
            // 展開：顯示完整文字
            newDescription = textToUse;
        } else {
            // 收起：顯示截斷文字
            const truncationResult = truncator.truncateText(textToUse);
            newDescription = truncationResult.truncatedText;
        }

        // 檢查是否有防爆雷標記（|| ||）
        const originalDescription = originalEmbed.description || '';
        const hasSpoiler = originalDescription.startsWith('||') && originalDescription.endsWith('||');

        // 如果有防爆雷標記，保留它
        if (hasSpoiler) {
            newDescription = `||${newDescription}||`;
        }

        // 更新主要 embed（第一個）
        const newEmbed = {
            ...originalEmbed.toJSON(),
            description: newDescription
        };

        // 保留所有其他 embeds（圖片等）
        const allEmbeds = [newEmbed];
        if (message.embeds.length > 1) {
            for (let i = 1; i < message.embeds.length; i++) {
                allEmbeds.push(message.embeds[i].toJSON());
            }
        }

        // 獲取現有的所有 components
        const existingComponents = message.components || [];
        const newComponents = [...existingComponents];

        // 找到包含切換按鈕的那一行
        const toggleRowIndex = existingComponents.findIndex(row =>
            row.components && row.components.some(btn =>
                btn.customId && (
                    btn.customId.includes('show_quote') || btn.customId.includes('hide_quote') ||
                    btn.customId.includes('show_reply') || btn.customId.includes('hide_reply') ||
                    btn.customId.startsWith('twitter_expand_') || btn.customId.startsWith('twitter_collapse_')
                )
            )
        );

        if (toggleRowIndex !== -1) {
            const existingRow = existingComponents[toggleRowIndex];
            const newButtons = existingRow.components.map(btn => {
                if (btn.customId && (btn.customId.startsWith('twitter_expand_') || btn.customId.startsWith('twitter_collapse_'))) {
                    return extractor.buildExpandToggleButtonComponent(tweetId, isExpanding);
                }
                return btn;
            });
            newComponents[toggleRowIndex] = new ActionRowBuilder().addComponents(...newButtons);
        } else {
            const newButton = new ActionRowBuilder().addComponents(
                extractor.buildExpandToggleButtonComponent(tweetId, isExpanding)
            );
            newComponents.push(newButton);
        }

        // 更新訊息（保留所有 embeds 包括圖片）
        await interaction.update({
            embeds: allEmbeds,
            components: newComponents
        });

        return true;

    } catch (error) {
        console.error('[TwitterExpandInteraction] 處理失敗:', error);

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: '❌ 處理失敗，請稍後再試',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '❌ 處理失敗，請稍後再試',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('[TwitterExpandInteraction] 回應失敗:', replyError);
        }

        return false;
    }
}

module.exports = {
    handleTwitterExpandInteraction,
    execute: handleTwitterExpandInteraction
};
