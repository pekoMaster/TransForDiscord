/**
 * 防爆雷按鈕互動處理器（V2 Components 版本）
 * 處理來自 tfd-system 轉貼訊息下方的 🕶️ 按鈕
 * 流程：按鈕 → Modal 輸入理由 → 送 log → 用 V2 Container 重發防爆雷版本
 */

const {
    MessageFlags, ActionRowBuilder, ButtonBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
    MediaGalleryBuilder, MediaGalleryItemBuilder
} = require('discord.js');
const { sendWithWebhook, canUseWebhook, hasWebhookPermission } = require('../utils/webhook-manager.js');
const db = require('../db');
const tlog = require('../utils/tfd-logger');

/**
 * 從 webhook 訊息的 -# 標記行中提取原作者 ID
 */
function extractOriginalAuthor(content) {
    if (!content) return null;
    const match = content.match(/^-#\s*<@(\d+)>/m);
    return match ? match[1] : null;
}

/**
 * 從訊息中收集所有可用媒體 URL（embed image/thumbnail/video + attachments）
 */
function collectMediaUrls(message) {
    const urls = [];

    if (message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            if (embed.image?.url) urls.push(embed.image.url);
            if (embed.video?.url) urls.push(embed.video.url);
            else if (embed.thumbnail?.url && !embed.image?.url) urls.push(embed.thumbnail.url);
        }
    }

    if (message.attachments && message.attachments.size > 0) {
        for (const [, attachment] of message.attachments) {
            urls.push(attachment.url);
        }
    }

    return [...new Set(urls)];
}

/**
 * 把 embed 的文字資訊整理成純文字（給 TextDisplay 用）
 */
function embedToPlainText(embed) {
    const lines = [];
    if (embed.author?.name) {
        const authorLine = embed.author.url
            ? `[${embed.author.name}](${embed.author.url})`
            : embed.author.name;
        lines.push(`**${authorLine}**`);
    }
    if (embed.title) {
        const titleLine = embed.url ? `[${embed.title}](${embed.url})` : embed.title;
        lines.push(`__${titleLine}__`);
    }
    if (embed.description) {
        lines.push(embed.description);
    }
    if (embed.fields && embed.fields.length > 0) {
        for (const field of embed.fields) {
            lines.push(`**${field.name}**\n${field.value}`);
        }
    }
    return lines.join('\n');
}

/**
 * 偵測訊息是否為 V2 Container 格式（非傳統 Embed）
 */
function isV2ContainerMessage(message) {
    if (!message) return false;
    // Check flags bit 32768 (IsComponentsV2)
    if (message.flags?.bitfield && (message.flags.bitfield & 32768)) return true;
    // Heuristic: components[0].components exists with TextDisplay/MediaGallery items
    const comps = message.components;
    if (comps && comps.length > 0 && comps[0].components && comps[0].components.length > 0) {
        for (const c of comps[0].components) {
            if (c.type === 1 || c.type === 2 || c.data?.type === 1 || c.data?.type === 2) return true;
        }
    }
    return false;
}

/**
 * 從 V2 Container 訊息中擷取原始作者 ID
 * 優先從 header TextDisplay 的 -# 行解析
 */
function extractAuthorFromV2Content(message) {
    try {
        const comps = message.components;
        if (comps?.[0]?.components?.[0]) {
            const first = comps[0].components[0];
            const content = first.content || first.data?.content || '';
            const match = content.match(/# <@!?(\d+)>/);
            if (match) return match[1];
        }
    } catch (_) {}
    return null;
}

/**
 * 構建防爆雷 V2 Container（純函式，無 interaction 依賴）
 *
 * @param {Message} targetMessage - 要防爆雷的 Discord 訊息
 * @param {Object} opts
 * @param {string} opts.operatorId - 操作者 user ID
 * @param {string} [opts.reason] - 防爆雷理由
 * @param {string} [opts.originalAuthorId] - 原作者 user ID（NULL 則自動從訊息解析）
 * @returns {Object} { container, originalAuthorId }
 */
function buildSpoilerComponents(targetMessage, { operatorId, reason = '', originalAuthorId = null } = {}) {
        // V2 Container message: reconstruct with spoiler tags
    if (isV2ContainerMessage(targetMessage)) {
        return buildV2SpoilerContainer(targetMessage, { operatorId, reason });
    }

    // Traditional embed message
    const resolvedAuthorId = originalAuthorId
        || extractOriginalAuthor(targetMessage.content)
        || targetMessage.mentions?.users?.first()?.id
        || null;

    // Parse header/body split
    const rawContent = (targetMessage.content || '').replaceAll('||', '');
    const lines = rawContent.split('\n');
    const headerLines = [];
    const bodyLines = [];
    let headerDone = false;

    for (const line of lines) {
        if (!headerDone && line.startsWith('-#')) {
            headerLines.push(line);
        } else {
            headerDone = true;
            bodyLines.push(line);
        }
    }

    const originalHeader = headerLines.join('\n');
    const bodyText = bodyLines.join('\n').trim();

    // Spoiler notice
    let spoilerNotice;
    if (resolvedAuthorId && resolvedAuthorId !== operatorId) {
        spoilerNotice = `-# 🕶️ <@${operatorId}> 將 <@${resolvedAuthorId}> 的訊息上了防爆雷，往後要注意喔`;
    } else {
        spoilerNotice = `-# 🕶️ <@${operatorId}> 將此訊息上了防爆雷`;
    }

    // Build V2 Container (red accent)
    const container = new ContainerBuilder().setAccentColor(0xED4245);

    // 1. Header (unspoiled): original -# lines + spoiler notice
    const headerParts = [];
    if (originalHeader) headerParts.push(originalHeader);
    headerParts.push(spoilerNotice);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(headerParts.join('\n'))
    );

    // 2. Separator
    container.addSeparatorComponents(new SeparatorBuilder());

    // 3. Body text (spoiled)
    if (bodyText) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`||${bodyText}||`)
        );
    }

    // 4. Embed text info (spoiled)
    if (targetMessage.embeds && targetMessage.embeds.length > 0) {
        for (const embed of targetMessage.embeds) {
            const embedText = embedToPlainText(embed);
            if (embedText) {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`||${embedText}||`)
                );
            }
        }
    }

    // 5. MediaGallery (spoiled)
    const mediaUrls = collectMediaUrls(targetMessage);
    if (mediaUrls.length > 0) {
        const items = mediaUrls.map(url =>
            new MediaGalleryItemBuilder()
                .setURL(url)
                .setSpoiler(true)
        );
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(...items)
        );
    }

    // 6. Footer (unspoiled, below images)
    if (targetMessage.embeds && targetMessage.embeds.length > 0) {
        const footerLines = [];
        for (const embed of targetMessage.embeds) {
            if (embed.footer?.text) {
                footerLines.push(`-# ${embed.footer.text}`);
            }
        }
        if (footerLines.length > 0) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(footerLines.join('\n'))
            );
        }
    }

    return { container, originalAuthorId: resolvedAuthorId };
}

/**
 * 為 V2 Container 訊息構建防爆雷容器
 */
function buildV2SpoilerContainer(targetMessage, { operatorId, reason = '' } = {}) {
    const originalAuthorId = extractAuthorFromV2Content(targetMessage) || null;

    // Parse existing container components
    const origComps = targetMessage.components;
    if (!origComps?.[0]?.components) {
        // Fallback to regular build
        return { container: null, originalAuthorId };
    }

    const items = origComps[0].components;
    let markerText = null;

    // Extract marker text from first TextDisplay
    if (items[0]) {
        const first = items[0];
        const content = first.content || first.data?.content || '';
        if (content && content.startsWith('-#')) {
            markerText = content;
        }
    }

    // Build spoiler container
    const container = new ContainerBuilder().setAccentColor(0xED4245);

    // Header: marker + spoiler notice
    const spoilerNotice = `-# 🕶️ <@${operatorId}> 將此訊息上了防爆雷${reason ? `（${reason}）` : ''}`;
    const headerParts = [];
    if (markerText) headerParts.push(markerText);
    headerParts.push(spoilerNotice);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(headerParts.join('\n'))
    );
    container.addSeparatorComponents(new SeparatorBuilder());

    // Walk remaining items and spoiler text content
    for (const item of items.slice(1)) {
        const rawContent = item.content || item.data?.content;
        const itemType = item.type || item.data?.type;

        // TextDisplay (type 1): wrap content in spoiler
        if ((itemType === 1 || itemType === 'text_display') && rawContent) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`||${rawContent}||`)
            );
        }
        // MediaGallery: set spoiler on items
        else if (item.components) {
            const galleryItems = [];
            for (const media of item.components) {
                const url = media.url || media.data?.url;
                if (url) {
                    galleryItems.push(
                        new MediaGalleryItemBuilder().setURL(url).setSpoiler(true)
                    );
                }
            }
            if (galleryItems.length > 0) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(...galleryItems)
                );
            }
        }
        // Separator: preserve
        else if (itemType === 2 || itemType === 'separator') {
            container.addSeparatorComponents(new SeparatorBuilder());
        }
        // Other (footer text, stats): preserve unspoilered
        else if (rawContent) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(rawContent)
            );
        }
    }

    return { container, originalAuthorId };
}

/**
 * 發送防爆雷 Container 並刪除原訊息（共用函式，供互動和非互動路徑使用）
 *
 * @param {Message} targetMessage
 * @param {ContainerBuilder} container
 * @returns {Promise<boolean>}
 */
async function sendSpoilerAndCleanup(targetMessage, container) {
    const channel = targetMessage.channel;

    if (targetMessage.webhookId && canUseWebhook(channel) && hasWebhookPermission(channel)) {
        const displayName = targetMessage.author.username;
        const avatarURL = targetMessage.author.displayAvatarURL({ dynamic: true });
        await sendWithWebhook(channel, {
            username: displayName,
            avatarURL,
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    } else {
        await channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] }
        });
    }

    try {
        await targetMessage.delete();
        return true;
    } catch (delErr) {
        tlog.sysError('防爆雷', `刪除原訊息失敗: ${delErr.message}`);
        return false;
    }
}

/**
 * Step 1: 按鈕點擊 → 跳出 Modal 輸入理由
 */
async function handleSpoilerButtonInteraction(interaction) {
    try {
        const modal = new ModalBuilder()
            .setCustomId(`spoiler_modal_${interaction.message.id}`)
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
    } catch (error) {
        tlog.sysError('防爆雷按鈕', `顯示 Modal 失敗: ${error}`);
    }
}

/**
 * Step 2: Modal 提交 → 送 log → 用 V2 Container 重發防爆雷版本
 */
async function handleSpoilerModalSubmit(interaction) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const reason = interaction.fields.getTextInputValue('spoiler_reason');
        const messageId = interaction.customId.replace('spoiler_modal_', '');
        const operatorId = interaction.user.id;

        let targetMessage;
        try {
            targetMessage = await interaction.channel.messages.fetch(messageId);
        } catch (fetchError) {
            await interaction.editReply({ content: '❌ 找不到目標訊息，可能已被刪除' });
            return;
        }

        // Build spoiler container (pure function)
        const { container, originalAuthorId } = buildSpoilerComponents(targetMessage, {
            operatorId,
            reason
        });

        // Log to guild's log channel
        try {
            const guildSettings = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
            const logChannelId = guildSettings?.log_channel_id;
            if (logChannelId) {
                const logChannel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const targetDesc = originalAuthorId ? `<@${originalAuthorId}>` : '未知用戶';
                    await logChannel.send({
                        embeds: [{
                            color: 0x5865F2,
                            description: `🕶️ 對 ${targetDesc} 的訊息使用了防爆雷`,
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
        } catch (logError) {
            tlog.sysError('防爆雷按鈕', `送 log 失敗: ${logError.message}`);
        }

        // Send spoiler version + delete original
        await sendSpoilerAndCleanup(targetMessage, container);

        await interaction.editReply({ content: '🕶️ 已套用防爆雷' });

    } catch (error) {
        tlog.sysError('防爆雷按鈕', `處理失敗: ${error}`);
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: `❌ 防爆雷處理失敗：${error.message}` });
            }
        } catch (replyError) {
            tlog.sysError('防爆雷按鈕', `回覆錯誤失敗: ${replyError.message}`);
        }
    }
}

module.exports = {
    handleSpoilerButtonInteraction,
    handleSpoilerModalSubmit,
    buildSpoilerComponents,
    sendSpoilerAndCleanup
};
