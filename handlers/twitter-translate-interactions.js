/**
 * Twitter AI 翻譯互動處理器
 * 處理推文翻譯按鈕的點擊事件
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getInstance: getApiKeyService } = require('../utils/user-api-key-service.js');
const { getInstance: getGeminiTranslator } = require('../utils/gemini-translator.js');
const openrouterTranslator = require('../utils/openrouter-translator.js');
const sharedCache = require('../utils/shared-translation-cache.js');

// 引入快取系統以取得完整文字
const { getCachedContent } = require('./content-translation-interactions.js');

// 翻譯狀態快取（記錄哪些推文目前是翻譯狀態，純 UI 狀態，不需持久化）
// 格式: Map<tweetId, { isTranslated, translatedFullText, originalFullText }>
const translationStateCache = new Map();

// 翻譯狀態快取過期時間（1 小時，UI 狀態不需要太長）
const STATE_CACHE_TTL = 60 * 60 * 1000;

/**
 * 處理翻譯按鈕互動
 * @param {Interaction} interaction - Discord 互動物件
 */
async function handleTranslateInteraction(interaction) {
    const customId = interaction.customId;

    // 解析按鈕類型
    if (customId.startsWith('twitter_translate_')) {
        await handleTranslateButton(interaction);
    } else if (customId.startsWith('twitter_original_')) {
        await handleShowOriginalButton(interaction);
    }
}

/**
 * 處理「翻譯」按鈕點擊
 */
async function handleTranslateButton(interaction) {
    const tweetId = interaction.customId.replace('twitter_translate_', '');
    const userId = interaction.user.id;

    try {
        // ⚡ 立即延遲回應（避免 3 秒超時）
        // 必須在任何耗時操作（如資料庫查詢）之前執行
        await interaction.deferUpdate();

        // 檢查用戶是否有 API Key
        const apiKeyService = getApiKeyService();
        const userApiKey = await apiKeyService.getApiKey(userId, 'gemini');

        // 獲取原始嵌入訊息
        const originalMessage = interaction.message;
        const originalEmbed = originalMessage.embeds[0];

        if (!originalEmbed) {
            await interaction.followUp({ content: '❌ 無法獲取推文內容', ephemeral: true });
            return;
        }

        // ① 查共享持久快取（所有用戶共用，不需重複翻譯）
        const cachedEntry = sharedCache.get(tweetId);
        let translatedFullText;
        let fullOriginalText;

        if (cachedEntry) {
            console.log(`[Twitter-Translate] 命中共享快取: ${tweetId} (模型: ${cachedEntry.model})`);
            translatedFullText = cachedEntry.translatedText;
            fullOriginalText = cachedEntry.originalText;
        } else {
            // 快取未命中，需要翻譯

            // 取得原文
            fullOriginalText = getCachedContent(tweetId);

            if (!fullOriginalText) {
                try {
                    const HTTPClient = require('../ermiana-system/utils/http-client');
                    const httpClient = new HTTPClient();
                    const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, { timeout: 5000 });
                    if (fxapiResp?.tweet?.text) fullOriginalText = fxapiResp.tweet.text;
                } catch (_) {}
            }

            if (!fullOriginalText) fullOriginalText = originalEmbed.description;

            if (!fullOriginalText) {
                await interaction.followUp({ content: '❌ 無法獲取推文內容', ephemeral: true });
                return;
            }

            // 翻譯流程：② Gemini（個人 Key）→ ③ OpenRouter → ④ DeepL 兜底
            let translateResult;
            let usedModel = 'unknown';

            if (userApiKey) {
                // ② 用戶有個人 Gemini Key → 優先使用（自己的配額）
                console.log(`[Twitter-Translate] 使用 Gemini（個人 Key）翻譯: ${tweetId}`);
                const geminiTranslator = getGeminiTranslator();
                translateResult = await geminiTranslator.translateWithUserKey(fullOriginalText, userApiKey, { targetLanguage: '繁體中文' });
                usedModel = 'gemini-user-key';
            } else {
                // ③ 系統翻譯：OpenRouter 三層模型
                console.log(`[Twitter-Translate] 使用 OpenRouter 翻譯: ${tweetId}`);
                const orResult = await openrouterTranslator.translate(fullOriginalText);

                if (orResult.success) {
                    translateResult = orResult;
                    usedModel = orResult.model;
                } else {
                    // ④ OpenRouter 全部失敗 → DeepL 兜底
                    console.warn(`[Twitter-Translate] OpenRouter 全部失敗，使用 DeepL 兜底: ${tweetId}`);
                    const DeepLTranslator = require('../utils/deepl-translator.js');
                    const deepl = new DeepLTranslator();
                    const deepResult = await deepl.translate(fullOriginalText, 'ZH');
                    translateResult = deepResult.success
                        ? { success: true, text: deepResult.translatedText }
                        : { success: false, error: deepResult.error, errorType: 'DEEPL_ERROR' };
                    usedModel = 'deepl';
                }
            }

            if (!translateResult.success) {
                let errorMessage;
                switch (translateResult.errorType) {
                    case 'QUOTA_EXHAUSTED':
                        errorMessage = '⚠️ Gemini API 額度已用盡，請稍後再試。';
                        break;
                    case 'INVALID_API_KEY':
                        errorMessage = '❌ Gemini API Key 無效，請用 `/apikey set` 重新設定。';
                        break;
                    case 'ALL_MODELS_COOLDOWN':
                        errorMessage = '⏳ 翻譯服務目前繁忙（達到使用限制），請 5 分鐘後再試。';
                        break;
                    case 'DEEPL_ERROR':
                        errorMessage = `❌ 翻譯失敗：所有服務均無法使用，請稍後再試。`;
                        break;
                    default:
                        errorMessage = `❌ 翻譯失敗：${translateResult.error || '未知錯誤'}`;
                }
                await interaction.followUp({ content: errorMessage, ephemeral: true });
                return;
            }

            translatedFullText = translateResult.text;

            // 儲存到共享快取（7 天，所有用戶共用）
            sharedCache.set(tweetId, {
                translatedText: translatedFullText,
                originalText: fullOriginalText,
                model: usedModel
            });
        }

        // 檢查當前是展開還是收起狀態（檢查是否有 expand/collapse 按鈕）
        const isCurrentlyExpanded = originalMessage.components?.some(row =>
            row.components?.some(btn =>
                btn.customId?.startsWith('twitter_collapse_')
            )
        );

        // 根據當前狀態決定顯示截斷還是完整翻譯
        let displayText = translatedFullText;
        if (!isCurrentlyExpanded) {
            // 如果目前是收起狀態，截斷翻譯文字
            const TextTruncator = require('../ermiana-system/utils/text-truncator.js');
            const truncator = new TextTruncator();
            const truncationResult = truncator.truncateText(translatedFullText);
            if (truncationResult.isTruncated) {
                displayText = truncationResult.truncatedText;
                console.log(`[Twitter-Translate] 翻譯文字已截斷: ${translatedFullText.length} -> ${displayText.length}`);
            }
        }

        // 更新翻譯狀態快取（供展開/收起功能使用）
        translationStateCache.set(tweetId, {
            isTranslated: true,
            translatedFullText: translatedFullText,
            originalFullText: fullOriginalText,
            timestamp: Date.now()
        });

        // 建立翻譯後的嵌入訊息
        const translatedEmbed = EmbedBuilder.from(originalEmbed)
            .setDescription(displayText)
            .setFooter({
                text: `${originalEmbed.footer?.text || ''} | 🌐 AI 翻譯`,
                iconURL: originalEmbed.footer?.iconURL
            });

        // 更新按鈕狀態（將「翻譯」改為「原文」）
        const updatedComponents = updateTranslateButton(
            originalMessage.components,
            tweetId,
            true // isTranslated = true
        );

        // 儲存原始文字到訊息資料中（用於切換回原文）
        // 使用 interaction.message 的 content 或其他方式存儲

        // 使用 editReply（因為已經 deferUpdate）
        await interaction.editReply({
            embeds: [translatedEmbed],
            components: updatedComponents
        });

        console.log(`[Twitter-Translate] 翻譯完成: ${tweetId}`);

    } catch (error) {
        console.error('[Twitter-Translate] 翻譯錯誤:', error);

        try {
            if (interaction.deferred) {
                await interaction.followUp({
                    content: '❌ 翻譯時發生錯誤，請稍後再試',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '❌ 翻譯時發生錯誤，請稍後再試',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('[Twitter-Translate] 回應錯誤:', replyError);
        }
    }
}

/**
 * 處理「原文」按鈕點擊（切換回原文）
 */
async function handleShowOriginalButton(interaction) {
    const tweetId = interaction.customId.replace('twitter_original_', '');

    try {
        // ⚡ 立即延遲回應（避免 3 秒超時）
        await interaction.deferUpdate();

        const originalMessage = interaction.message;
        const currentEmbed = originalMessage.embeds[0];

        if (!currentEmbed) {
            await interaction.followUp({
                content: '❌ 無法獲取訊息內容',
                ephemeral: true
            });
            return;
        }

        // 優先從翻譯狀態快取獲取原文
        let originalFullText = null;
        const translationState = translationStateCache.get(tweetId);
        if (translationState && translationState.originalFullText) {
            originalFullText = translationState.originalFullText;
        }

        // 如果翻譯快取沒有，從內容快取獲取
        if (!originalFullText) {
            originalFullText = getCachedContent(tweetId);
        }

        // 如果還是沒有，從 API 獲取
        if (!originalFullText) {
            console.log(`[Twitter-Translate] 快取中無原文，從 API 獲取: ${tweetId}`);
            const HTTPClient = require('../ermiana-system/utils/http-client');
            const httpClient = new HTTPClient();

            try {
                const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                    timeout: 5000
                });

                if (fxapiResp && fxapiResp.tweet && fxapiResp.tweet.text) {
                    originalFullText = fxapiResp.tweet.text;
                }
            } catch (fetchError) {
                console.error('[Twitter-Translate] 從 API 獲取失敗:', fetchError.message);
            }
        }

        if (!originalFullText) {
            await interaction.followUp({
                content: '❌ 無法獲取原始推文內容，請稍後再試',
                ephemeral: true
            });
            return;
        }

        // 檢查當前是展開還是收起狀態
        const isCurrentlyExpanded = originalMessage.components?.some(row =>
            row.components?.some(btn =>
                btn.customId?.startsWith('twitter_collapse_')
            )
        );

        // 根據當前狀態決定顯示截斷還是完整原文
        let displayText = originalFullText;
        if (!isCurrentlyExpanded) {
            // 如果目前是收起狀態，截斷原文
            const TextTruncator = require('../ermiana-system/utils/text-truncator.js');
            const truncator = new TextTruncator();
            const truncationResult = truncator.truncateText(originalFullText);
            if (truncationResult.isTruncated) {
                displayText = truncationResult.truncatedText;
                console.log(`[Twitter-Translate] 原文已截斷: ${originalFullText.length} -> ${displayText.length}`);
            }
        }

        // 更新翻譯狀態快取（標記為非翻譯狀態，但保留完整文字）
        if (translationState) {
            translationState.isTranslated = false;
            translationStateCache.set(tweetId, translationState);
        }

        // 還原嵌入訊息
        const restoredEmbed = EmbedBuilder.from(currentEmbed)
            .setDescription(displayText)
            .setFooter({
                text: (currentEmbed.footer?.text || '').replace(' | 🌐 AI 翻譯', ''),
                iconURL: currentEmbed.footer?.iconURL
            });

        // 更新按鈕狀態（將「原文」改回「翻譯」）
        const updatedComponents = updateTranslateButton(
            originalMessage.components,
            tweetId,
            false // isTranslated = false
        );

        // 使用 editReply（因為已經 deferUpdate）
        await interaction.editReply({
            embeds: [restoredEmbed],
            components: updatedComponents
        });

        console.log(`[Twitter-Translate] 已切換回原文: ${tweetId}`);

    } catch (error) {
        console.error('[Twitter-Translate] 切換原文錯誤:', error);

        try {
            if (interaction.deferred) {
                await interaction.followUp({
                    content: '❌ 切換時發生錯誤，請稍後再試',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('[Twitter-Translate] 回應錯誤:', replyError);
        }
    }
}

/**
 * 更新翻譯按鈕狀態
 * @param {Array} components - 原始組件陣列
 * @param {string} tweetId - 推文 ID
 * @param {boolean} isTranslated - 是否已翻譯狀態
 * @returns {Array} 更新後的組件陣列
 */
function updateTranslateButton(components, tweetId, isTranslated) {
    if (!components || components.length === 0) {
        return components;
    }

    return components.map(row => {
        const newRow = ActionRowBuilder.from(row);
        const buttons = newRow.components.map(button => {
            // 檢查是否為翻譯相關按鈕
            if (button.data.custom_id?.startsWith('twitter_translate_') ||
                button.data.custom_id?.startsWith('twitter_original_')) {
                // 建立新的翻譯按鈕
                return new ButtonBuilder()
                    .setCustomId(isTranslated ? `twitter_original_${tweetId}` : `twitter_translate_${tweetId}`)
                    .setLabel(isTranslated ? '原文' : '翻譯')
                    .setEmoji('🌐')
                    .setStyle(isTranslated ? ButtonStyle.Secondary : ButtonStyle.Success);
            }
            return ButtonBuilder.from(button);
        });

        return new ActionRowBuilder().addComponents(buttons);
    });
}

/**
 * 獲取翻譯狀態（供展開/收起功能使用）
 * @param {string} tweetId - 推文 ID
 * @returns {Object|null} 翻譯狀態物件
 */
function getTranslationState(tweetId) {
    const state = translationStateCache.get(tweetId);
    if (!state) return null;

    // 檢查是否過期
    if (Date.now() - state.timestamp > STATE_CACHE_TTL) {
        translationStateCache.delete(tweetId);
        return null;
    }

    return state;
}

/**
 * 更新翻譯狀態
 * @param {string} tweetId - 推文 ID
 * @param {Object} state - 狀態物件
 */
function setTranslationState(tweetId, state) {
    translationStateCache.set(tweetId, {
        ...state,
        timestamp: Date.now()
    });
}

module.exports = {
    handleTranslateInteraction,
    execute: handleTranslateInteraction,
    getTranslationState,
    setTranslationState
};
