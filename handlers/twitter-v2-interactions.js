/**
 * Twitter V2 Container 互動處理器
 * 處理 V2 影片推文的按鈕互動（翻譯/原文、展開/收起引用回覆、展開/收起全文）
 */

const { MessageFlags, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { buildV2Container, getCachedTweetData, cacheTweetData, deriveStateFromComponents } = require('./twitter-v2-container-builder');
const { lookupUrl } = require('../tfd-system/utils/url-stats');
const db = require('../db');

function getTimePrefix() {
    const now = new Date();
    return `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}]`;
}

/**
 * 主路由
 */
async function handleV2Interaction(interaction) {
    if (!interaction.isButton()) return;
    const id = interaction.customId;

    try {
        if (id.startsWith('v2_translate_') || id.startsWith('v2_original_')) {
            await handleV2Translate(interaction);
        } else if (id.startsWith('v2_expand_all_') || id.startsWith('v2_collapse_all_')) {
            await handleV2Toggle(interaction, 'all');
        } else if (id.startsWith('v2_reload_')) {
            await handleV2Reload(interaction);
        } else if (id.startsWith('v2_spoiler_')) {
            await handleV2Spoiler(interaction);
        }
    } catch (error) {
        console.error(`${getTimePrefix()} [V2-Interactions] 錯誤:`, error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ 處理時發生錯誤', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.followUp({ content: '❌ 處理時發生錯誤', flags: MessageFlags.Ephemeral });
            }
        } catch (_) {}
    }
}

/**
 * 從 customId 提取 tweetId
 */
function extractTweetId(customId) {
    // 格式: v2_action_tweetId 或 v2_action_subaction_tweetId
    const parts = customId.split('_');
    return parts[parts.length - 1];
}

/**
 * 重建並更新 V2 Container
 */
async function rebuildAndUpdate(interaction, tweetId, stateOverrides = {}) {
    const cached = getCachedTweetData(tweetId);
    if (!cached) {
        // 快取已過期，嘗試從 API 重新取得
        try {
            const HTTPClient = require('../tfd-system/utils/http-client');
            const httpClient = new HTTPClient();
            const resp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, { timeout: 5000 });
            if (resp?.tweet) {
                cacheTweetData(tweetId, { tweet: resp.tweet, originalURL: `https://twitter.com/i/status/${tweetId}` });
                return rebuildAndUpdate(interaction, tweetId, stateOverrides);
            }
        } catch (_) {}

        await interaction.followUp({ content: '❌ 推文資料已過期，請重新貼文', flags: MessageFlags.Ephemeral });
        return;
    }

    const { tweet, originalURL, quoteData, replyData } = cached;

    // 從現有按鈕推導目前狀態
    const currentState = deriveStateFromComponents(interaction.message.components, tweetId);

    // 合併覆蓋
    const newState = { ...currentState, ...stateOverrides };

    // 重建 Container
    let urlStats = null;
    try {
        const tweetUrl = originalURL || `https://twitter.com/i/status/${tweetId}`;
        if (interaction.guildId && interaction.channelId) {
            urlStats = lookupUrl(tweetUrl, interaction.guildId, interaction.channelId);
        }
    } catch (_) {}

    const container = buildV2Container(tweet, originalURL, {
        isTranslated: newState.isTranslated,
        translatedText: newState.translatedText || null,
        translatedQuoteText: newState.translatedQuoteText || null,
        translatedReplyText: newState.translatedReplyText || null,
        isQuoteShown: newState.isQuoteShown,
        isReplyShown: newState.isReplyShown,
        isExpanded: newState.isExpanded,
        quoteData,
        replyData,
        urlStats,
    });

    // 重新加入 marker text（用戶標記行）
    const { TextDisplayBuilder, SeparatorBuilder } = require('discord.js');

    // 從原訊息中提取 marker（第一個 text_display 組件）
    let markerText = null;
    const origComponents = interaction.message.components;
    if (origComponents?.[0]?.components?.[0]) {
        const first = origComponents[0].components[0];
        // V2 Container 結構: TextDisplay(marker) → Separator → Section...
        if (first.data?.type === 10 || first.type === 10) { // TextDisplay type = 10
            markerText = first.data?.content || first.content;
        }
    }

    if (markerText) {
        container.components = [
            new TextDisplayBuilder().setContent(markerText),
            new SeparatorBuilder().setDivider(true),
            ...container.components
        ];
    }

    await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

// 翻譯快取 Map<tweetId, { translatedText, translatedQuoteText, translatedReplyText }>
const v2TranslationCache = new Map();

/**
 * V2 翻譯 / 原文切換
 */
async function handleV2Translate(interaction) {
    const tweetId = extractTweetId(interaction.customId);
    const isTranslateAction = interaction.customId.startsWith('v2_translate_');

    await interaction.deferUpdate();

    if (!isTranslateAction) {
        // 切回原文
        await rebuildAndUpdate(interaction, tweetId, { isTranslated: false });
        console.log(`${getTimePrefix()} [V2-Interactions] 切回原文: ${tweetId}`);
        return;
    }

    // 翻譯
    const userId = interaction.user.id;

    // 檢查 API Key
    const { getInstance: getApiKeyService } = require('../utils/user-api-key-service.js');
    const apiKeyService = getApiKeyService();
    const userApiKey = await apiKeyService.getApiKey(userId, 'gemini');

    if (!userApiKey) {
        await interaction.followUp({
            content: `## 🌐 翻譯功能需要設定 API Key\n\n此功能使用 **Google Gemini AI** 進行翻譯，需要你提供自己的 API Key。\n\n### 📝 設定步驟：\n1. 前往 [Google AI Studio](https://aistudio.google.com/app/apikey) 取得免費 API Key\n2. 使用 \`/pe api add\` 指令登記你的 API Key`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // 檢查翻譯快取
    const cached = v2TranslationCache.get(tweetId);
    if (cached) {
        await rebuildAndUpdate(interaction, tweetId, {
            isTranslated: true,
            ...cached,
        });
        console.log(`${getTimePrefix()} [V2-Interactions] 使用快取翻譯: ${tweetId}`);
        return;
    }

    // 取得推文資料
    const tweetData = getCachedTweetData(tweetId);
    if (!tweetData?.tweet) {
        await interaction.followUp({ content: '❌ 推文資料已過期', flags: MessageFlags.Ephemeral });
        return;
    }

    const tweet = tweetData.tweet;
    const quoteData = tweetData.quoteData;
    const replyData = tweetData.replyData;

    // 組合翻譯文本
    let textToTranslate = tweet.text || '';
    const QUOTE_SEP = '\n\n---QUOTE---\n\n';
    const REPLY_SEP = '\n\n---REPLY---\n\n';

    if (quoteData?.tweet?.text) textToTranslate += QUOTE_SEP + quoteData.tweet.text;
    if (replyData?.tweet?.text) textToTranslate += REPLY_SEP + replyData.tweet.text;

    // 執行翻譯
    const { getInstance: getGeminiTranslator } = require('../utils/gemini-translator.js');
    const geminiTranslator = getGeminiTranslator();

    const translateOptions = { targetLanguage: '繁體中文' };
    if (tweet.author?.name) translateOptions.authorName = tweet.author.name;

    console.log(`${getTimePrefix()} [V2-Interactions] 開始翻譯: ${tweetId} (${textToTranslate.length} 字)`);

    const result = await geminiTranslator.translateWithUserKey(textToTranslate, userApiKey, translateOptions);

    if (!result.success) {
        const errorMap = {
            'QUOTA_EXHAUSTED': '⚠️ 翻譯服務目前無法使用，請和開發者聯絡。',
            'INVALID_API_KEY': '❌ API Key 無效，請使用 `/pe api add` 重新設定。',
            'TIMEOUT': '⏰ 翻譯超時，請稍後再試',
        };
        await interaction.followUp({
            content: errorMap[result.errorType] || `❌ 翻譯失敗：${result.error || '未知錯誤'}`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // 拆分翻譯結果
    let fullTranslation = result.text;
    let translatedQuoteText = '';
    let translatedReplyText = '';

    if (replyData?.tweet?.text && fullTranslation.includes('---REPLY---')) {
        const parts = fullTranslation.split(/---REPLY---/);
        fullTranslation = parts[0];
        translatedReplyText = parts.slice(1).join('').trim();
    }
    if (quoteData?.tweet?.text && fullTranslation.includes('---QUOTE---')) {
        const parts = fullTranslation.split(/---QUOTE---/);
        fullTranslation = parts[0];
        translatedQuoteText = parts.slice(1).join('').trim();
    }
    const translatedText = fullTranslation.replace(/---QUOTE---/g, '').replace(/---REPLY---/g, '').trim();

    // 快取翻譯結果
    const translationData = { translatedText, translatedQuoteText, translatedReplyText };
    v2TranslationCache.set(tweetId, translationData);

    // 30 分鐘後清除快取
    setTimeout(() => v2TranslationCache.delete(tweetId), 30 * 60 * 1000);

    await apiKeyService.incrementUsageCount(userId, 'gemini');

    await rebuildAndUpdate(interaction, tweetId, {
        isTranslated: true,
        ...translationData,
    });

    console.log(`${getTimePrefix()} [V2-Interactions] 翻譯完成: ${tweetId}`);
}

/**
 * V2 展開/收起（引用、回覆、全文）
 */
async function handleV2Toggle(interaction, type) {
    const tweetId = extractTweetId(interaction.customId);
    await interaction.deferUpdate();

    const overrides = {};
    if (type === 'all') {
        const isExpanding = interaction.customId.startsWith('v2_expand_all_');
        overrides.isQuoteShown = isExpanding;
        overrides.isReplyShown = isExpanding;
        overrides.isExpanded = isExpanding;
    }

    // 保留翻譯狀態
    const cachedTranslation = v2TranslationCache.get(tweetId);
    if (cachedTranslation) {
        const currentState = deriveStateFromComponents(interaction.message.components, tweetId);
        if (currentState.isTranslated) {
            overrides.isTranslated = true;
            overrides.translatedText = cachedTranslation.translatedText;
            overrides.translatedQuoteText = cachedTranslation.translatedQuoteText;
            overrides.translatedReplyText = cachedTranslation.translatedReplyText;
        }
    }

    await rebuildAndUpdate(interaction, tweetId, overrides);
    console.log(`${getTimePrefix()} [V2-Interactions] ${type} 切換: ${tweetId}`);
}

module.exports = { handleV2Interaction, handleV2SpoilerModalSubmit };

/**
 * V2 重整
 */
async function handleV2Reload(interaction) {
    const tweetId = extractTweetId(interaction.customId);
    await interaction.deferUpdate();
    try {
        const HTTPClient = require('../tfd-system/utils/http-client');
        const httpClient = new HTTPClient();
        const resp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, { timeout: 8000 });
        if (resp?.tweet) {
            const existingCached = getCachedTweetData(tweetId);
            cacheTweetData(tweetId, {
                tweet: resp.tweet,
                originalURL: existingCached?.originalURL || `https://twitter.com/i/status/${tweetId}`,
                quoteData: existingCached?.quoteData || null,
                replyData: existingCached?.replyData || null,
            });
            await rebuildAndUpdate(interaction, tweetId, {});
            console.log(`${getTimePrefix()} [V2-Interactions] 重整成功: ${tweetId}`);
        } else {
            await interaction.followUp({ content: '❌ 無法重新載入推文資料', flags: MessageFlags.Ephemeral });
        }
    } catch (error) {
        console.error(`${getTimePrefix()} [V2-Interactions] 重整失敗:`, error);
        await interaction.followUp({ content: '❌ 重整失敗，請稍後再試', flags: MessageFlags.Ephemeral });
    }
}

/**
 * V2 防爆雷按鈕 → 顯示 Modal
 */
async function handleV2Spoiler(interaction) {
    const tweetId = extractTweetId(interaction.customId);
    const messageId = interaction.message.id;
    const modal = new ModalBuilder()
        .setCustomId(`v2_spoiler_modal_${tweetId}_${messageId}`)
        .setTitle('防爆雷理由')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('spoiler_reason')
                    .setLabel('請輸入防爆雷的理由')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('例如：劇透、敏感圖片')
                    .setRequired(true)
                    .setMaxLength(100)
            )
        );
    await interaction.showModal(modal);
}

/**
 * V2 防爆雷 Modal 提交
 */
async function handleV2SpoilerModalSubmit(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // customId: v2_spoiler_modal_{tweetId}_{messageId}
    const withoutPrefix = interaction.customId.replace('v2_spoiler_modal_', '');
    const underscoreIdx = withoutPrefix.indexOf('_');
    const tweetId = withoutPrefix.substring(0, underscoreIdx);
    const messageId = withoutPrefix.substring(underscoreIdx + 1);

    const reason = interaction.fields.getTextInputValue('spoiler_reason');
    const operatorId = interaction.user.id;

    // 取得原始訊息
    let message;
    try {
        message = await interaction.channel.messages.fetch(messageId);
    } catch (e) {
        await interaction.editReply({ content: '❌ 找不到目標訊息，可能已被刪除' });
        return;
    }

    // 送 log（per-guild 日誌頻道）
    try {
        const guildSettings = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
        const logChannelId = guildSettings?.log_channel_id;
        if (logChannelId) {
            const logChannel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
            if (logChannel) {
                await logChannel.send({
                    embeds: [{
                        color: 0x5865F2,
                        description: `🕶️ 對推文 \`${tweetId}\` 使用了防爆雷`,
                        fields: [
                            { name: '操作者', value: `<@${operatorId}>`, inline: true },
                            { name: '頻道', value: `<#${interaction.channelId}>`, inline: true },
                            { name: '理由', value: reason || '（無）', inline: false },
                        ],
                        timestamp: new Date().toISOString(),
                    }],
                    allowedMentions: { parse: [] }
                });
            }
        }
    } catch (e) {
        console.error('[V2-Spoiler] 送 log 失敗:', e.message);
    }

    // 取得快取推文資料
    const cached = getCachedTweetData(tweetId);

    // 從原訊息的 V2 Container 提取 marker text
    let markerText = null;
    try {
        const origComps = message.components;
        if (origComps?.[0]?.components?.[0]) {
            const first = origComps[0].components[0];
            const content = first.content || first.data?.content;
            // marker 是 -# 開頭的程式行，不是推文內文
            if (content && content.startsWith('-#')) {
                markerText = content;
            }
        }
    } catch (e) { /* 靜默失敗 */ }

    // 建構防爆雷 V2 Container
    const {
        ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
        MediaGalleryBuilder, MediaGalleryItemBuilder
    } = require('discord.js');

    const spoilerContainer = new ContainerBuilder().setAccentColor(0xED4245);
    const spoilerNotice = `-# 🕶️ <@${operatorId}> 將此推文上了防爆雷\n-# 理由：${reason}`;
    const headerParts = [];
    if (markerText) headerParts.push(markerText);
    headerParts.push(spoilerNotice);
    spoilerContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(headerParts.join('\n'))
    );
    spoilerContainer.addSeparatorComponents(new SeparatorBuilder());

    if (cached?.tweet) {
        const tweet = cached.tweet;
        const author = tweet.author;
        const authorUrl = `https://twitter.com/${author.screen_name}`;
        spoilerContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `||[@${author.screen_name}](${authorUrl})\n**${author.name}**\n${tweet.text || ''}||`
            )
        );
        const media = tweet.media?.all || [];
        if (media.length > 0) {
            const items = media.map(item =>
                new MediaGalleryItemBuilder().setURL(item.url).setSpoiler(true)
            );
            spoilerContainer.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(...items)
            );
        }
    } else {
        spoilerContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('||（推文內容已過期，無法顯示）||')
        );
    }

    // 發送防爆雷版本
    const { sendWithWebhook, canUseWebhook, hasWebhookPermission } = require('../utils/webhook-manager.js');
    const channel = interaction.channel;
    let sent = false;
    try {
        if (message.webhookId && canUseWebhook(channel) && hasWebhookPermission(channel)) {
            await sendWithWebhook(channel, {
                username: message.author.username,
                avatarURL: message.author.displayAvatarURL({ dynamic: true }),
                components: [spoilerContainer],
                flags: MessageFlags.IsComponentsV2
            });
        } else {
            await channel.send({
                components: [spoilerContainer],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { parse: [] }
            });
        }
        sent = true;
    } catch (e) {
        console.error('[V2-Spoiler] 發送失敗:', e.message);
    }

    if (sent) {
        try { await message.delete(); } catch (e) {
            console.error('[V2-Spoiler] 刪除原訊息失敗:', e.message);
        }
    }

    await interaction.editReply({ content: '🕶️ 已套用防爆雷' });
}
