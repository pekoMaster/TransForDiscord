/**
 * Twitter AI 翻譯互動處理器
 * 處理推文翻譯按鈕的點擊事件
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getInstance: getApiKeyService } = require('../utils/user-api-key-service.js');
const { getInstance: getGeminiTranslator } = require('../utils/gemini-translator.js');
const { translate: openrouterTranslate } = require('../utils/openrouter-translator.js');

// 引入快取系統以取得完整文字
const { getCachedContent } = require('./content-translation-interactions.js');
const tlog = require('../utils/tfd-logger');

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
2. 使用 \`/pe api add\` 指令登記你的 API Key

### 💡 免費額度：
- 每分鐘 15 次請求
- 每日 1500 次請求

設定完成後即可使用翻譯功能！`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // 獲取原始嵌入訊息
        const originalMessage = interaction.message;
        const originalEmbed = originalMessage.embeds[0];

        if (!originalEmbed) {
            await interaction.followUp({
                content: '❌ 無法獲取推文內容',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // 優先從快取取得完整文字
        let fullOriginalText = getCachedContent(tweetId);
        let tweetData = null; // 保存完整 API 回應以取得引用推文

        // 如果快取沒有，嘗試從 fxtwitter API 獲取
        if (!fullOriginalText) {
            tlog.log('Twitter-翻譯', interaction, `快取中無完整文字，從 API 獲取: ${tweetId}`);
            try {
                const HTTPClient = require('../tfd-system/utils/http-client');
                const httpClient = new HTTPClient();
                const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                    timeout: 5000
                });

                if (fxapiResp && fxapiResp.tweet) {
                    tweetData = fxapiResp.tweet;
                    fullOriginalText = tweetData.text;
                }
            } catch (fetchError) {
                tlog.sysError('Twitter-翻譯', `從 API 獲取失敗:`, fetchError.message);
            }
        } else {
            // 有快取文字但沒有 tweetData，嘗試獲取（為了引用推文上下文）
            try {
                const HTTPClient = require('../tfd-system/utils/http-client');
                const httpClient = new HTTPClient();
                const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                    timeout: 5000
                });
                if (fxapiResp && fxapiResp.tweet) tweetData = fxapiResp.tweet;
            } catch (_) {}
        }

        // 如果還是沒有，使用 embed 中的文字作為後備
        if (!fullOriginalText) {
            fullOriginalText = originalEmbed.description;
        }

        if (!fullOriginalText) {
            await interaction.followUp({
                content: '❌ 無法獲取推文內容',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // 提取引用推文/回覆推文的原文作為翻譯上下文
        let quoteContext = '';
        let quoteOriginalText = ''; // 引用推文的原文（用於翻譯）
        let replyOriginalText = ''; // 回覆推文的原文（用於翻譯）
        
        if (tweetData) {
            // 引用推文
            if (tweetData.quote) {
                const qt = tweetData.quote;
                quoteOriginalText = qt.text || '';
                quoteContext += `[引用推文 by @${qt.author?.screen_name || ''}]: ${quoteOriginalText}\n`;
            }
            // 回覆對象（replying_to_status 是推文 ID 字串，需要額外 API 呼叫取得內容）
            if (tweetData.replying_to_status) {
                try {
                    const HTTPClient = require('../tfd-system/utils/http-client');
                    const replyHttpClient = new HTTPClient();
                    const replyResp = await replyHttpClient.fetchJSON(
                        `https://api.fxtwitter.com/i/status/${tweetData.replying_to_status}`,
                        { timeout: 5000 }
                    );
                    if (replyResp?.tweet) {
                        const rt = replyResp.tweet;
                        replyOriginalText = rt.text || ''; // 保存回覆推文原文
                        quoteContext += `[被回覆的推文 by @${rt.author?.screen_name || ''}]: ${replyOriginalText}\n`;
                    }
                } catch (replyFetchErr) {
                    tlog.warn('Twitter-翻譯', interaction, `獲取回覆推文失敗: ${replyFetchErr.message}`);
                }
            }
        }

        // 也從 embed fields 中提取已展開的引用/回覆內容作為上下文
        if (!quoteContext && originalEmbed.fields?.length > 0) {
            for (const field of originalEmbed.fields) {
                if (field.value && (field.value.includes('[RT](') || field.value.includes('[↩️ 回覆]('))) {
                    // 清除 markdown 格式提取純文字
                    const cleanText = field.value
                        .replace(/^> /gm, '')
                        .replace(/\[.*?\]\(.*?\)/g, '')
                        .replace(/\u3000/g, '')
                        .trim();
                    if (cleanText) {
                        quoteContext += `[引用/回覆內容]: ${cleanText}\n`;
                    }
                }
            }
        }

        // 組合翻譯文本：主推文 + 引用推文 + 回覆推文（一起翻譯）
        let textToTranslate = fullOriginalText;
        const QUOTE_SEPARATOR = '\n\n---QUOTE---\n\n';
        const REPLY_SEPARATOR = '\n\n---REPLY---\n\n';
        
        if (quoteOriginalText) {
            textToTranslate += QUOTE_SEPARATOR + quoteOriginalText;
        }
        if (replyOriginalText) {
            textToTranslate += REPLY_SEPARATOR + replyOriginalText;
        }

        // 檢查快取
        const cacheKey = `${tweetId}_${userId}`;
        const cachedTranslation = getFromCache(cacheKey);

        let translatedFullText;
        let translatedQuoteText = '';
        let translatedReplyText = ''; // 回覆推文的翻譯

        if (cachedTranslation && cachedTranslation.fullText) {
            tlog.log('Twitter-翻譯', interaction, `使用快取翻譯: ${tweetId}`);
            translatedFullText = cachedTranslation.fullText;
            translatedQuoteText = cachedTranslation.quoteText || '';
            translatedReplyText = cachedTranslation.replyText || ''; // 回覆推文的翻譯
        } else {
            // 先顯示「翻譯中...」提示，讓用戶知道正在處理
            try {
                const loadingEmbed = EmbedBuilder.from(originalEmbed)
                    .setDescription('🔄 正在翻譯中，請稍候...')
                    .setFooter({
                        text: `${(originalEmbed.footer?.text || '').replace(/ \| 🌐 翻譯中\.\.\./g, '').replace(/ \| 🌐 AI 翻譯/g, '')} | 🌐 翻譯中...`,
                        iconURL: originalEmbed.footer?.iconURL
                    });
                const loadingEmbeds = [loadingEmbed];
                if (originalMessage.embeds.length > 1) {
                    for (let i = 1; i < originalMessage.embeds.length; i++) {
                        loadingEmbeds.push(originalMessage.embeds[i].toJSON());
                    }
                }
                await interaction.editReply({
                    embeds: loadingEmbeds,
                    components: originalMessage.components
                });
            } catch (loadingErr) {
                tlog.warn('Twitter-翻譯', interaction, `顯示翻譯中提示失敗:`, loadingErr.message);
            }

            // 執行翻譯（主推文 + 引用推文 + 回覆推文一起翻，用上下文提高準確度）
            tlog.log('Twitter-翻譯', interaction, `開始翻譯推文: ${tweetId} (主文: ${fullOriginalText.length}字, 引用: ${quoteOriginalText.length}字, 回覆: ${replyOriginalText.length}字, 上下文: ${quoteContext.length}字)`);

            const geminiTranslator = getGeminiTranslator();

            const translateOptions = { targetLanguage: '繁體中文' };
            // 傳入發文者帳號名稱（用於自稱判定）
            if (tweetData?.author?.name) {
                translateOptions.authorName = tweetData.author.name;
            } else if (originalEmbed.author?.name) {
                translateOptions.authorName = originalEmbed.author.name;
            }
            // 如果有上下文但沒有引用原文合併翻譯，則作為 context 傳入
            if (quoteContext && !quoteOriginalText) {
                translateOptions.context = quoteContext;
            }

            const translateResult = await geminiTranslator.translateWithUserKey(
                textToTranslate,
                userApiKey,
                translateOptions
            );

            if (!translateResult.success) {
                // Gemini 失敗（含 HK 地區封鎖）→ 嘗試 OpenRouter fallback
                tlog.sys('Twitter-翻譯', `Gemini 失敗 (${translateResult.errorType})，嘗試 OpenRouter fallback`);
                const orOptions = {};
                if (translateOptions.authorName) orOptions.authorName = translateOptions.authorName;
                const orResult = await openrouterTranslate(textToTranslate, orOptions);

                if (orResult.success) {
                    translateResult.success = true;
                    translateResult.text = orResult.text;
                } else {
                    let errorMessage = '❌ 翻譯失敗';
                    switch (translateResult.errorType) {
                        case 'QUOTA_EXHAUSTED':
                            errorMessage = '⚠️ 翻譯配額已用盡，請和開發者聯絡。';
                            break;
                        case 'INVALID_API_KEY':
                            errorMessage = '❌ API Key 無效\n\n請使用 `/pe api add` 重新設定正確的 API Key。';
                            break;
                        case 'TIMEOUT':
                            errorMessage = '⏰ 翻譯超時，請稍後再試';
                            break;
                        default:
                            errorMessage = `❌ 翻譯失敗：${translateResult.error || '未知錯誤'}`;
                    }
                    await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
                    return;
                }
            }

            // 拆分翻譯結果（主推文 + 引用推文 + 回覆推文）
            const fullTranslation = translateResult.text;
            let remaining = fullTranslation;
            
            // 先拆 REPLY（從後面拆，避免順序依賴）
            if (replyOriginalText && remaining.includes('---REPLY---')) {
                const replyParts = remaining.split(/---REPLY---/);
                remaining = replyParts[0];
                translatedReplyText = replyParts.slice(1).join('').trim();
            }
            
            // 再拆 QUOTE
            if (quoteOriginalText && remaining.includes('---QUOTE---')) {
                const quoteParts = remaining.split(/---QUOTE---/);
                remaining = quoteParts[0];
                translatedQuoteText = quoteParts.slice(1).join('').trim();
            }
            
            translatedFullText = remaining.replace(/---QUOTE---/g, '').replace(/---REPLY---/g, '').trim();

            // 儲存完整翻譯到快取（包含引用和回覆翻譯）
            saveToCache(cacheKey, { fullText: translatedFullText, quoteText: translatedQuoteText, replyText: translatedReplyText });

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
            const TextTruncator = require('../tfd-system/utils/text-truncator.js');
            const truncator = new TextTruncator();
            const truncationResult = truncator.truncateText(translatedFullText);
            if (truncationResult.isTruncated) {
                displayText = truncationResult.truncatedText;
                tlog.log('Twitter-翻譯', interaction, `翻譯文字已截斷: ${translatedFullText.length} -> ${displayText.length}`);
            }
        }

        // 更新翻譯狀態快取（供展開/收起功能使用，包含引用和回覆翻譯）
        translationStateCache.set(tweetId, {
            isTranslated: true,
            translatedFullText: translatedFullText,
            translatedQuoteText: translatedQuoteText,
            translatedReplyText: translatedReplyText,
            originalFullText: fullOriginalText,
            originalQuoteText: quoteOriginalText,
            originalReplyText: replyOriginalText,
            timestamp: Date.now()
        });

        // 建立翻譯後的嵌入訊息
        const translatedEmbed = EmbedBuilder.from(originalEmbed)
            .setDescription(displayText)
            .setFooter({
                text: `${(originalEmbed.footer?.text || '').replace(/ \| 🌐 翻譯中\.\.\./g, '').replace(/ \| 🌐 AI 翻譯/g, '')} | 🌐 AI 翻譯`,
                iconURL: originalEmbed.footer?.iconURL
            });

        // 如果引用/回覆已展開（field 已存在），更新為翻譯內容
        // 但不自動展開原本收起的引用/回覆
        if ((translatedQuoteText || translatedReplyText) && translatedEmbed.data.fields?.length > 0) {
            const existingFields = translatedEmbed.data.fields;
            for (let i = 0; i < existingFields.length; i++) {
                const field = existingFields[i];
                if (field.value && field.value.includes('[RT](') && translatedQuoteText) {
                    const lines = field.value.split('\n');
                    const headerLine = lines[0];
                    const spacerLine = lines[1] || '> \u3000';
                    const translatedQuoteLines = translatedQuoteText
                        .split('\n')
                        .map(line => line.trim() === '' ? '> \u3000' : `> ${line}`)
                        .join('\n');
                    existingFields[i].value = `${headerLine}\n${spacerLine}\n${translatedQuoteLines}`;
                } else if (field.value && field.value.includes('[↩️ 回覆](') && translatedReplyText) {
                    const lines = field.value.split('\n');
                    const headerLine = lines[0];
                    const spacerLine = lines[1] || '> \u3000';
                    const translatedReplyLines = translatedReplyText
                        .split('\n')
                        .map(line => line.trim() === '' ? '> \u3000' : `> ${line}`)
                        .join('\n');
                    existingFields[i].value = `${headerLine}\n${spacerLine}\n${translatedReplyLines}`;
                }
            }
        }

        // 更新按鈕狀態（將「翻譯」改為「原文」）
        const updatedComponents = updateTranslateButton(
            originalMessage.components,
            tweetId,
            true // isTranslated = true
        );

        // 保留所有 embeds（主 embed + 圖片 embeds）
        const allEmbeds = [translatedEmbed];
        if (originalMessage.embeds.length > 1) {
            for (let i = 1; i < originalMessage.embeds.length; i++) {
                allEmbeds.push(originalMessage.embeds[i].toJSON());
            }
        }

        // 使用 editReply（因為已經 deferUpdate）
        await interaction.editReply({
            embeds: allEmbeds,
            components: updatedComponents
        });

    } catch (error) {
        tlog.sysError('Twitter-翻譯', `翻譯錯誤:`, error);

        try {
            if (interaction.deferred) {
                await interaction.followUp({
                    content: '❌ 翻譯時發生錯誤，請稍後再試',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: '❌ 翻譯時發生錯誤，請稍後再試',
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (replyError) {
            tlog.sysError('Twitter-翻譯', `回應錯誤:`, replyError);
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
                flags: MessageFlags.Ephemeral
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
            tlog.log('Twitter-翻譯', interaction, `快取中無原文，從 API 獲取: ${tweetId}`);
            const HTTPClient = require('../tfd-system/utils/http-client');
            const httpClient = new HTTPClient();

            try {
                const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                    timeout: 5000
                });

                if (fxapiResp && fxapiResp.tweet && fxapiResp.tweet.text) {
                    originalFullText = fxapiResp.tweet.text;
                }
            } catch (fetchError) {
                tlog.sysError('Twitter-翻譯', `從 API 獲取失敗:`, fetchError.message);
            }
        }

        if (!originalFullText) {
            await interaction.followUp({
                content: '❌ 無法獲取原始推文內容，請稍後再試',
                flags: MessageFlags.Ephemeral
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
            const TextTruncator = require('../tfd-system/utils/text-truncator.js');
            const truncator = new TextTruncator();
            const truncationResult = truncator.truncateText(originalFullText);
            if (truncationResult.isTruncated) {
                displayText = truncationResult.truncatedText;
                tlog.log('Twitter-翻譯', interaction, `原文已截斷: ${originalFullText.length} -> ${displayText.length}`);
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

        // 如果引用/回覆已展開（field 已存在），還原為原文
        if (translationState && restoredEmbed.data.fields?.length > 0) {
            for (let i = 0; i < restoredEmbed.data.fields.length; i++) {
                const field = restoredEmbed.data.fields[i];
                if (field.value && field.value.includes('[RT](') && translationState.originalQuoteText) {
                    const lines = field.value.split('\n');
                    const headerLine = lines[0];
                    const spacerLine = lines[1] || '> \u3000';
                    const originalQuoteLines = translationState.originalQuoteText
                        .split('\n')
                        .map(line => line.trim() === '' ? '> \u3000' : `> ${line}`)
                        .join('\n');
                    restoredEmbed.data.fields[i].value = `${headerLine}\n${spacerLine}\n${originalQuoteLines}`;
                } else if (field.value && field.value.includes('[↩️ 回覆](') && translationState.originalReplyText) {
                    const lines = field.value.split('\n');
                    const headerLine = lines[0];
                    const spacerLine = lines[1] || '> \u3000';
                    const originalReplyLines = translationState.originalReplyText
                        .split('\n')
                        .map(line => line.trim() === '' ? '> \u3000' : `> ${line}`)
                        .join('\n');
                    restoredEmbed.data.fields[i].value = `${headerLine}\n${spacerLine}\n${originalReplyLines}`;
                }
            }
        }

        // 更新按鈕狀態（將「原文」改回「翻譯」）
        const updatedComponents = updateTranslateButton(
            originalMessage.components,
            tweetId,
            false // isTranslated = false
        );

        // 保留所有 embeds（主 embed + 圖片 embeds）
        const allEmbeds = [restoredEmbed];
        if (originalMessage.embeds.length > 1) {
            for (let i = 1; i < originalMessage.embeds.length; i++) {
                allEmbeds.push(originalMessage.embeds[i].toJSON());
            }
        }

        // 使用 editReply（因為已經 deferUpdate）
        await interaction.editReply({
            embeds: allEmbeds,
            components: updatedComponents
        });

        tlog.log('Twitter-翻譯', interaction, `已切換回原文: ${tweetId}`);

    } catch (error) {
        tlog.sysError('Twitter-翻譯', `切換原文錯誤:`, error);

        try {
            if (interaction.deferred) {
                await interaction.followUp({
                    content: '❌ 切換時發生錯誤，請稍後再試',
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (replyError) {
            tlog.sysError('Twitter-翻譯', `回應錯誤:`, replyError);
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
                    .setStyle(ButtonStyle.Secondary);
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
