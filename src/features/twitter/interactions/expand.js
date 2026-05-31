/**
 * Twitter 文字展開/收起按鈕互動處理器
 * 處理「顯示全文」和「縮回全文」按鈕的切換功能
 */

const { ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');

// 從 content-translation-interactions.js 引入快取系統
const { getCachedContent } = require('../../translation/cache/content-cache');

// 從翻譯處理器引入翻譯狀態快取
const { getTranslationState } = require('./translation');
const tlog = require('../../../../utils/tfd-logger');

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
            tlog.sys('TwitterExpandInteraction', `⚠️ 未知的 customId: ${customId}`);
            return false;
        }

        // 獲取原始訊息
        const message = interaction.message;
        if (!message || !message.embeds || message.embeds.length === 0) {
            await interaction.reply({
                content: '❌ 無法找到推文內容',
                flags: MessageFlags.Ephemeral
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
        const TextTruncator = require('../../../shared/discord/text-truncator.js');
        const truncator = new TextTruncator();

        // 決定要使用的文字（翻譯文字或原文）
        let textToUse;
        let needsAPIFetch = false;

        if (isTranslated) {
            // 翻譯狀態下：優先用翻譯快取的完整文字
            if (translationState && translationState.translatedFullText) {
                textToUse = translationState.translatedFullText;
            } else {
                // 沒有翻譯快取 — 使用當前 embed 內容
                const currentDescription = originalEmbed.description || '';

                if (isExpanding) {
                    // 嘗試從 embed description 恢復（可能是截斷的翻譯）
                    // 如果無法取得完整翻譯，提示用戶
                    await interaction.reply({
                        content: '⚠️ 翻譯快取已過期，無法展開完整翻譯內容。\n請點擊「原文」按鈕後重新翻譯。',
                        flags: MessageFlags.Ephemeral
                    });
                    return true;
                } else {
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
                const HTTPClient = require('../../../shared/http/http-client');
                const httpClient = new HTTPClient();
                const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                    timeout: 5000
                });

                if (fxapiResp && fxapiResp.tweet && fxapiResp.tweet.text) {
                    textToUse = fxapiResp.tweet.text;
                }
            } catch (fetchError) {
                tlog.sysError('TwitterExpandInteraction', `從 API 獲取失敗: ${fetchError.message}`);
            }
        }

        if (!textToUse) {
            await interaction.reply({
                content: '❌ 推文內容已過期，請重新發送連結',
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        let newDescription;
        // 創建新的展開/收起按鈕組件
        const TFDTwitterExtractor = require('../extractors/twitter-v2-extractor');
        const extractor = new TFDTwitterExtractor();

        if (isExpanding) {
            // 展開：顯示完整文字（Discord embed description 上限 4096 字元）
            if (textToUse.length > 4086) {
                newDescription = textToUse.slice(0, 4084) + '\n…';
            } else {
                newDescription = textToUse;
            }
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

        // 如果是翻譯狀態且有引用翻譯，更新引用 field 為翻譯版本
        if (isTranslated && translationState && translationState.translatedQuoteText && newEmbed.fields) {
            for (let i = 0; i < newEmbed.fields.length; i++) {
                const field = newEmbed.fields[i];
                if (field.value && (field.value.includes('[RT](') || field.value.includes('[↩️ 回覆]('))) {
                    const lines = field.value.split('\n');
                    const headerLine = lines[0];
                    const spacerLine = lines[1] || '> \u3000';
                    const translatedQuoteLines = translationState.translatedQuoteText
                        .split('\n')
                        .map(line => line.trim() === '' ? '> \u3000' : `> ${line}`)
                        .join('\n');
                    newEmbed.fields[i].value = `${headerLine}\n${spacerLine}\n${translatedQuoteLines}`;
                }
            }
        }

        // 🔧 修復：保留所有其他 embeds（圖片等）
        const allEmbeds = [newEmbed];
        if (message.embeds.length > 1) {
            // 保留第 2 個及之後的 embeds（通常是圖片）
            for (let i = 1; i < message.embeds.length; i++) {
                allEmbeds.push(message.embeds[i].toJSON());
            }
        }

        // 獲取現有的所有 components
        const existingComponents = message.components || [];
        const newComponents = [...existingComponents];

        // 找到包含切換按鈕的那一行（與其他按鈕同一行）
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
            // 在同一行中更新展開/收起按鈕
            const existingRow = existingComponents[toggleRowIndex];
            const newButtons = existingRow.components.map(btn => {
                if (btn.customId && (btn.customId.startsWith('twitter_expand_') || btn.customId.startsWith('twitter_collapse_'))) {
                    return extractor.buildExpandToggleButtonComponent(tweetId, isExpanding); // isExpanding 決定按鈕狀態
                }
                return btn;
            });
            newComponents[toggleRowIndex] = new ActionRowBuilder().addComponents(...newButtons);
        } else {
            // 沒有找到切換按鈕行（理論上不應該發生），添加新的單獨按鈕
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
        tlog.sysError('TwitterExpandInteraction', `處理失敗: ${error}`);

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
            tlog.sysError('TwitterExpandInteraction', `回應失敗: ${replyError}`);
        }

        return false;
    }
}

module.exports = {
    handleTwitterExpandInteraction
};
