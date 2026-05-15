/**
 * Twitter V2 Container interaction handlers.
 * Handles translation, original view, expand/collapse, reload, and spoiler report.
 */

const {
    ActionRowBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const TFDTwitterExtractor = require('../tfd-system/extractors/twitter-v2.js');
const {
    buildV2Container,
    getCachedTweetData,
    cacheTweetData,
    deriveStateFromComponents
} = require('./twitter-v2-container-builder');
const { lookupUrl } = require('../tfd-system/utils/url-stats');
const { getMessageState, setMessageState } = require('../utils/twitter-v2-state-store');
const { getPreferredProvider, PROVIDERS } = require('../utils/user-api-key-storage');
const { buildTextBundle } = require('../utils/translation/text-bundle');
const { translateTweet } = require('../utils/translation/translation-service');
const sharedTranslationCache = require('../utils/shared-translation-cache');
const db = require('../db');
const tlog = require('../utils/tfd-logger');

const V2_TRANSLATION_TTL_MS = 30 * 60 * 1000;
const v2TranslationCache = new Map();

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
        tlog.sysError('V2-Interactions', `互動處理失敗: ${error.message}`);
        await safeInteractionNotice(interaction, '互動處理失敗，請稍後再試。');
    }
}

async function safeInteractionNotice(interaction, content) {
    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        }
    } catch (_) {}
}

function extractTweetId(customId) {
    const parts = customId.split('_');
    return parts[parts.length - 1];
}

function extractMarkerTextFromMessage(message) {
    const origComponents = message?.components;
    if (!origComponents?.[0]?.components?.[0]) return null;

    const first = origComponents[0].components[0];
    if (first.data?.type === 10 || first.type === 10) {
        return first.data?.content || first.content || null;
    }

    return null;
}

async function hydrateTweetBundle(tweetId, originalURL = null) {
    const HTTPClient = require('../tfd-system/utils/http-client');
    const httpClient = new HTTPClient();
    const resp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, { timeout: 5000 });
    if (!resp?.tweet) return null;

    const tweet = resp.tweet;
    const fallbackOriginalURL = originalURL || `https://twitter.com/i/status/${tweetId}`;
    const extractor = new TFDTwitterExtractor();

    let quoteData = null;
    let replyData = null;

    if (extractor.isReplyTweet(tweet)) {
        const replyInfo = await extractor.getReplyTweetInfo(tweet);
        if (replyInfo) {
            replyData = {
                tweet: replyInfo.tweet || null,
                tweetId: replyInfo.tweetId || null
            };
        }
    }

    if (extractor.isQuoteTweet(tweet)) {
        const quoteInfo = extractor.getQuoteTweetInfo(tweet);
        if (quoteInfo) {
            quoteData = {
                tweet: quoteInfo.tweet || null,
                tweetId: quoteInfo.tweetId || null
            };
        }
    }

    const hydrated = { tweet, originalURL: fallbackOriginalURL, quoteData, replyData };
    cacheTweetData(tweetId, hydrated);
    return hydrated;
}

function getV2TranslationCacheKey(tweetId, provider = 'unknown') {
    return `${tweetId}_${provider || 'unknown'}`;
}

function getCachedV2Translation(tweetId, provider = null) {
    if (provider) {
        const providerCached = v2TranslationCache.get(getV2TranslationCacheKey(tweetId, provider));
        if (providerCached) return providerCached;

        const sharedCached = sharedTranslationCache.get(tweetId, provider);
        if (sharedCached?.translated) {
            return {
                translatedText: sharedCached.translated.main || '',
                translatedQuoteText: sharedCached.translated.quote || '',
                translatedReplyText: sharedCached.translated.reply || ''
            };
        }
    }
    return v2TranslationCache.get(tweetId);
}

function setCachedV2Translation(tweetId, provider, translationData) {
    const providerKey = getV2TranslationCacheKey(tweetId, provider);
    v2TranslationCache.set(providerKey, translationData);
    v2TranslationCache.set(tweetId, translationData);

    setTimeout(() => {
        v2TranslationCache.delete(providerKey);
        v2TranslationCache.delete(tweetId);
    }, V2_TRANSLATION_TTL_MS);
}

function buildFallbackState(interaction, tweetId, cached = null) {
    const derived = deriveStateFromComponents(interaction.message.components, tweetId);
    const cachedTranslation = getCachedV2Translation(tweetId);

    return {
        tweetId,
        originalURL: cached?.originalURL || `https://twitter.com/i/status/${tweetId}`,
        markerText: extractMarkerTextFromMessage(interaction.message),
        isTranslated: Boolean(derived.isTranslated && cachedTranslation),
        translatedText: cachedTranslation?.translatedText || null,
        translatedQuoteText: cachedTranslation?.translatedQuoteText || null,
        translatedReplyText: cachedTranslation?.translatedReplyText || null,
        isExpanded: Boolean(derived.isExpanded),
        isQuoteShown: Boolean(derived.isQuoteShown),
        isReplyShown: Boolean(derived.isReplyShown)
    };
}

async function rebuildAndUpdate(interaction, tweetId, stateOverrides = {}, options = {}) {
    const { refreshData = false } = options;

    let cached = getCachedTweetData(tweetId);
    if (!cached || refreshData) {
        try {
            cached = await hydrateTweetBundle(tweetId, cached?.originalURL);
        } catch (_) {
            cached = null;
        }
    }

    if (!cached) {
        await interaction.followUp({
            content: '找不到推文資料，請重新貼一次推文或稍後再試。',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }

    const { tweet, originalURL, quoteData, replyData } = cached;
    const storedState = getMessageState(interaction.message.id) || buildFallbackState(interaction, tweetId, cached);
    const newState = {
        ...storedState,
        ...stateOverrides,
        tweetId,
        originalURL,
        markerText: stateOverrides.markerText !== undefined ? stateOverrides.markerText : storedState.markerText
    };

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
        urlStats
    });

    const { TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
    if (newState.markerText) {
        container.components = [
            new TextDisplayBuilder().setContent(newState.markerText),
            new SeparatorBuilder().setDivider(true),
            ...container.components
        ];
    }

    await interaction.editReply({
        content: null,
        embeds: [],
        components: [container],
        flags: MessageFlags.IsComponentsV2
    });

    setMessageState(interaction.message.id, newState);
    return true;
}

async function handleV2Translate(interaction) {
    const tweetId = extractTweetId(interaction.customId);
    const isTranslateAction = interaction.customId.startsWith('v2_translate_');

    await interaction.deferUpdate();

    if (!isTranslateAction) {
        await rebuildAndUpdate(interaction, tweetId, { isTranslated: false });
        tlog.log('V2-翻譯', interaction, `切回原文: ${tweetId}`);
        return;
    }

    const userId = interaction.user.id;
    const preferredProvider = getPreferredProvider(userId);
    const providerName = PROVIDERS[preferredProvider]?.name || preferredProvider;

    if (!preferredProvider) {
        await interaction.followUp({
            content: '請先使用 `/pe api model` 選擇翻譯引擎，再使用翻譯功能。',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const cached = getCachedV2Translation(tweetId, preferredProvider);
    if (cached) {
        await rebuildAndUpdate(interaction, tweetId, {
            isTranslated: true,
            ...cached
        });
        tlog.log('V2-翻譯', interaction, `使用快取翻譯: ${tweetId}`);
        return;
    }

    const tweetData = getCachedTweetData(tweetId);
    if (!tweetData?.tweet) {
        await interaction.followUp({
            content: '找不到推文資料，請重新貼一次推文或按重整後再試。',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const { tweet, quoteData, replyData } = tweetData;
    const textBundle = buildTextBundle({
        main: tweet.text || '',
        quote: quoteData?.tweet?.text || '',
        reply: replyData?.tweet?.text || ''
    });

    tlog.log('V2-翻譯', interaction, `開始翻譯: ${tweetId} (${providerName}, ${textBundle.combined.length} 字)`);

    const result = await translateTweet({
        textBundle,
        userId,
        provider: preferredProvider,
        authorName: tweet.author?.name || null,
        context: '',
        allowEnvFallback: false
    });

    if (!result.success) {
        await interaction.followUp({
            content: result.error || '翻譯失敗，請稍後再試或更換翻譯引擎。',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const translationData = {
        translatedText: result.translated.main,
        translatedQuoteText: result.translated.quote,
        translatedReplyText: result.translated.reply
    };
    setCachedV2Translation(tweetId, preferredProvider, translationData);
    sharedTranslationCache.set(tweetId, preferredProvider, {
        original: {
            main: textBundle.main,
            quote: textBundle.quote,
            reply: textBundle.reply
        },
        translated: {
            main: result.translated.main,
            quote: result.translated.quote,
            reply: result.translated.reply
        },
        model: result.model || preferredProvider
    });

    await rebuildAndUpdate(interaction, tweetId, {
        isTranslated: true,
        ...translationData
    });

    tlog.log('V2-翻譯', interaction, `翻譯完成: ${tweetId} (${providerName})`);
    try { db.tfdStats.record('translation', interaction.guildId, interaction.user.id); } catch (_) {}
}

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

    const cachedTranslation = getCachedV2Translation(tweetId);
    if (cachedTranslation) {
        const currentState = getMessageState(interaction.message.id) || buildFallbackState(interaction, tweetId, getCachedTweetData(tweetId));
        if (currentState.isTranslated) {
            overrides.isTranslated = true;
            overrides.translatedText = cachedTranslation.translatedText;
            overrides.translatedQuoteText = cachedTranslation.translatedQuoteText;
            overrides.translatedReplyText = cachedTranslation.translatedReplyText;
        }
    }

    await rebuildAndUpdate(interaction, tweetId, overrides);
    tlog.log('V2-展開', interaction, `${type} 切換: ${tweetId}`);
}

async function handleV2Reload(interaction) {
    const tweetId = extractTweetId(interaction.customId);
    await interaction.deferUpdate();
    try {
        const updated = await rebuildAndUpdate(interaction, tweetId, {}, { refreshData: true });
        if (updated) {
            tlog.log('V2-重整', interaction, `重整成功: ${tweetId}`);
        }
    } catch (error) {
        tlog.sysError('V2-Interactions', `重整失敗: ${error.message}`);
        await interaction.followUp({
            content: '重整失敗，請稍後再試。',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleV2Spoiler(interaction) {
    const tweetId = extractTweetId(interaction.customId);
    const messageId = interaction.message.id;
    const modal = new ModalBuilder()
        .setCustomId(`v2_spoiler_modal_${tweetId}_${messageId}`)
        .setTitle('回報防爆雷')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('spoiler_reason')
                    .setLabel('請輸入回報原因')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('例如：內容含有劇情雷')
                    .setRequired(true)
                    .setMaxLength(100)
            )
        );
    await interaction.showModal(modal);
}

async function handleV2SpoilerModalSubmit(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const withoutPrefix = interaction.customId.replace('v2_spoiler_modal_', '');
    const underscoreIdx = withoutPrefix.indexOf('_');
    const tweetId = withoutPrefix.substring(0, underscoreIdx);
    const messageId = withoutPrefix.substring(underscoreIdx + 1);
    const reason = interaction.fields.getTextInputValue('spoiler_reason');
    const operatorId = interaction.user.id;

    let message;
    try {
        message = await interaction.channel.messages.fetch(messageId);
    } catch (_) {
        await interaction.editReply({ content: '找不到原始訊息，可能已被刪除。' });
        return;
    }

    await sendSpoilerLog(interaction, tweetId, operatorId, reason);

    const cached = getCachedTweetData(tweetId);
    const markerText = extractMarkerTextFromMessage(message);
    const spoilerContainer = buildSpoilerContainer(cached, markerText, operatorId, reason, tweetId);

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
    } catch (error) {
        tlog.sysError('V2-Spoiler', `發送防爆雷訊息失敗: ${error.message}`);
    }

    if (sent) {
        try {
            await message.delete();
        } catch (error) {
            tlog.sysError('V2-Spoiler', `刪除原始訊息失敗: ${error.message}`);
        }
    }

    await interaction.editReply({ content: sent ? '防爆雷訊息已重新送出。' : '防爆雷處理失敗，請稍後再試。' });
}

async function sendSpoilerLog(interaction, tweetId, operatorId, reason) {
    try {
        const guildSettings = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
        const logChannelId = guildSettings?.log_channel_id;
        if (!logChannelId) return;

        const logChannel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
        if (!logChannel) return;

        await logChannel.send({
            embeds: [{
                color: 0x5865F2,
                description: `防爆雷回報：\`${tweetId}\``,
                fields: [
                    { name: '操作者', value: `<@${operatorId}>`, inline: true },
                    { name: '頻道', value: `<#${interaction.channelId}>`, inline: true },
                    { name: '原因', value: reason || '未提供', inline: false }
                ],
                timestamp: new Date().toISOString()
            }],
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        tlog.sysError('V2-Spoiler', `寫入 log 失敗: ${error.message}`);
    }
}

function buildSpoilerContainer(cached, markerText, operatorId, reason) {
    const {
        ContainerBuilder,
        MediaGalleryBuilder,
        MediaGalleryItemBuilder,
        SeparatorBuilder,
        TextDisplayBuilder
    } = require('discord.js');

    const spoilerContainer = new ContainerBuilder().setAccentColor(0xED4245);
    const spoilerNotice = `-# <@${operatorId}> 已將此推文標記為防爆雷\n-# 原因：${reason}`;
    const headerParts = [];
    if (markerText) headerParts.push(markerText);
    headerParts.push(spoilerNotice);
    spoilerContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(headerParts.join('\n'))
    );
    spoilerContainer.addSeparatorComponents(new SeparatorBuilder());

    if (cached?.tweet) {
        const tweet = cached.tweet;
        const author = tweet.author || {};
        const authorUrl = `https://twitter.com/${author.screen_name || 'i'}`;
        spoilerContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `||[@${author.screen_name || 'unknown'}](${authorUrl})\n**${author.name || 'Unknown'}**\n${tweet.text || ''}||`
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
            new TextDisplayBuilder().setContent('||無法取得原始推文內容。||')
        );
    }

    return spoilerContainer;
}

module.exports = { handleV2Interaction, handleV2SpoilerModalSubmit };
