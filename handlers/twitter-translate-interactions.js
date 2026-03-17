/**
 * Twitter AI 翻譯互動處理器
 * 處理推文翻譯按鈕的點擊事件
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getInstance: getApiKeyService } = require('../utils/user-api-key-service.js');
const { getInstance: getGeminiTranslator } = require('../utils/gemini-translator.js');

// 引入快取系統以取得完整文字
const { getCachedContent } = require('./content-translation-interactions.js');

// 翻譯快取 (避免重複翻譯相同內容)
// 格式: Map<cacheKey, { text, fullText, timestamp }>
// text: 截斷後的翻譯文字, fullText: 完整翻譯文字
const translationCache = new Map();

// 翻譯狀態快取（記錄哪些推文目前是翻譯狀態）
// 格式: Map<tweetId, { isTranslated, translatedFullText, originalFullText }>
const translationStateCache = new Map();

// 快取過期時間 (30 分鐘)
const CACHE_TTL = 30 * 60 * 1000;

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

        if (!userApiKey) {
            // 用戶沒有 API Key，顯示引導訊息（使用 followUp 因為已經 defer）
            await interaction.followUp({
                content: `## 🌐 翻譯功能需要設定 API Key

此功能使用 **Google Gemini AI** 進行翻譯，需要你提供自己的 API Key。

### 📝 設定步驟：
1. 前往 [Google AI Studio](https://aistudio.google.com/app/apikey) 取得免費 API Key
2. 使用 \`/translate_api\` 指令登記你的 API Key

### 💡 免費額度：
- 每分鐘 15 次請求
- 每日 1500 次請求

設定完成後即可使用翻譯功能！`,
                ephemeral: true
            });
            return;
        }

        // 獲取原始嵌入訊息
        const originalMessage = interaction.message;
        const originalEmbed = originalMessage.embeds[0];

        if (!originalEmbed) {
            await interaction.followUp({
                content: '❌ 無法獲取推文內容',
                ephemeral: true
            });
            return;
        }

        // 優先從快取取得完整文字
        let fullOriginalText = getCachedContent(tweetId);

        // 如果快取沒有，嘗試從 fxtwitter API 獲取
        if (!fullOriginalText) {
            console.log(`[Twitter-Translate] 快取中無完整文字，從 API 獲取: ${tweetId}`);
            try {
                const HTTPClient = require('../ermiana-system/utils/http-client');
                const httpClient = new HTTPClient();
                const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                    timeout: 5000
                });

                if (fxapiResp && fxapiResp.tweet && fxapiResp.tweet.text) {
                    fullOriginalText = fxapiResp.tweet.text;
                }
            } catch (fetchError) {
                console.error(`[Twitter-Translate] 從 API 獲取失敗:`, fetchError.message);
            }
        }

        // 如果還是沒有，使用 embed 中的文字作為後備
        if (!fullOriginalText) {
            fullOriginalText = originalEmbed.description;
        }

        if (!fullOriginalText) {
            await interaction.followUp({
                content: '❌ 無法獲取推文內容',
                ephemeral: true
            });
            return;
        }

        // 檢查快取
        const cacheKey = `${tweetId}_${userId}`;
        const cachedTranslation = getFromCache(cacheKey);

        let translatedFullText;

        if (cachedTranslation && cachedTranslation.fullText) {
            console.log(`[Twitter-Translate] 使用快取翻譯: ${tweetId}`);
            translatedFullText = cachedTranslation.fullText;
        } else {
            // 執行翻譯（翻譯完整文字）
            console.log(`[Twitter-Translate] 開始翻譯推文完整文字: ${tweetId} (長度: ${fullOriginalText.length})`);

            const geminiTranslator = getGeminiTranslator();
            const originalText = fullOriginalText;

            const translateResult = await geminiTranslator.translateWithUserKey(
                originalText,
                userApiKey,
                { targetLanguage: '繁體中文' }
            );

            if (!translateResult.success) {
                // 處理錯誤
                let errorMessage = '❌ 翻譯失敗';

                switch (translateResult.errorType) {
                    case 'QUOTA_EXHAUSTED':
                        errorMessage = '⚠️ API 額度已用盡\n\n免費額度會在每分鐘/每日自動重置。\n每分鐘限制：15 次\n每日限制：1500 次';
                        break;
                    case 'INVALID_API_KEY':
                        errorMessage = '❌ API Key 無效\n\n請使用 `/translate_api` 重新設定正確的 API Key。';
                        break;
                    case 'TIMEOUT':
                        errorMessage = '⏰ 翻譯超時，請稍後再試';
                        break;
                    default:
                        errorMessage = `❌ 翻譯失敗：${translateResult.error || '未知錯誤'}`;
                }

                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
                return;
            }

            translatedFullText = translateResult.text;

            // 儲存完整翻譯到快取
            saveToCache(cacheKey, { fullText: translatedFullText });

            // 更新使用次數
            await apiKeyService.incrementUsageCount(userId, 'gemini');
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
 * 從快取獲取翻譯
 */
function getFromCache(key) {
    const cached = translationCache.get(key);
    if (!cached) return null;

    // 檢查是否過期
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        translationCache.delete(key);
        return null;
    }

    return cached;
}

/**
 * 儲存翻譯到快取
 */
function saveToCache(key, data) {
    translationCache.set(key, {
        ...data,
        timestamp: Date.now()
    });

    // 清理過期快取
    cleanExpiredCache();
}

/**
 * 清理過期快取
 */
function cleanExpiredCache() {
    const now = Date.now();
    for (const [key, value] of translationCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            translationCache.delete(key);
        }
    }

    // 同時清理翻譯狀態快取
    for (const [key, value] of translationStateCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            translationStateCache.delete(key);
        }
    }
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
    if (Date.now() - state.timestamp > CACHE_TTL) {
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
    getTranslationState,
    setTranslationState
};
