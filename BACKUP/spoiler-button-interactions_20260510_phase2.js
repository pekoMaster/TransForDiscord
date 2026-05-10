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

const LOG_CHANNEL_ID = '754991473698668606';

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

    // Embeds
    if (message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            if (embed.image?.url) urls.push(embed.image.url);
            if (embed.video?.url) urls.push(embed.video.url);
            else if (embed.thumbnail?.url && !embed.image?.url) urls.push(embed.thumbnail.url);
        }
    }

    // Attachments
    if (message.attachments && message.attachments.size > 0) {
        for (const [, attachment] of message.attachments) {
            urls.push(attachment.url);
        }
    }

    // 去重
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
    // footer 不在此處，另行置於圖片下方
    return lines.join('\n');
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
        console.error(`[防爆雷按鈕] 顯示 Modal 失敗:`, error);
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

        // 取得目標訊息
        let message;
        try {
            message = await interaction.channel.messages.fetch(messageId);
        } catch (fetchError) {
            await interaction.editReply({ content: '❌ 找不到目標訊息，可能已被刪除' });
            return;
        }

        // 抓取原作者：webhook 訊息第一個 mention 就是原始貼文者
        const originalAuthorId = extractOriginalAuthor(message.content)
            || message.mentions?.users?.first()?.id
            || null;

        // 送 log 到日誌頻道
        try {
            const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);
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
        } catch (logError) {
            console.error(`[防爆雷按鈕] 送 log 失敗:`, logError.message);
        }

        // 解析訊息文字：保留 -# 開頭的 header（原作者+連結等），分離出 body
        const rawContent = (message.content || '').replaceAll('||', '');
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

        // 防爆雷歸屬行
        let spoilerNotice;
        if (originalAuthorId && originalAuthorId !== operatorId) {
            spoilerNotice = `-# 🕶️ <@${operatorId}> 將 <@${originalAuthorId}> 的訊息上了防爆雷，往後要注意喔`;
        } else {
            spoilerNotice = `-# 🕶️ <@${operatorId}> 將此訊息上了防爆雷`;
        }

        // 構建 V2 Container（紅色標識，提醒這是防爆雷版本）
        const container = new ContainerBuilder().setAccentColor(0xED4245);

        // 1. 不遮罩的 header：原始 -# 行 + 防爆雷歸屬
        const headerParts = [];
        if (originalHeader) headerParts.push(originalHeader);
        headerParts.push(spoilerNotice);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(headerParts.join('\n'))
        );

        // 2. 分隔線
        container.addSeparatorComponents(new SeparatorBuilder());

        // 3. body 文字（用 ||..|| 遮罩）
        if (bodyText) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`||${bodyText}||`)
            );
        }

        // 4. embed 文字資訊（用 ||..|| 遮罩）
        if (message.embeds && message.embeds.length > 0) {
            for (const embed of message.embeds) {
                const embedText = embedToPlainText(embed);
                if (embedText) {
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`||${embedText}||`)
                    );
                }
            }
        }

        // 5. MediaGallery：所有圖片/影片 setSpoiler(true)
        const mediaUrls = collectMediaUrls(message);
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

        // 6. Footer（圖片下方，不遮罩，仿 V1 embed 格式）
        if (message.embeds && message.embeds.length > 0) {
            const footerLines = [];
            for (const embed of message.embeds) {
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

        // 先發送防爆雷版本，成功後再刪除原訊息
        const channel = interaction.channel;
        let sent = false;

        if (message.webhookId && canUseWebhook(channel) && hasWebhookPermission(channel)) {
            const displayName = message.author.username;
            const avatarURL = message.author.displayAvatarURL({ dynamic: true });

            await sendWithWebhook(channel, {
                username: displayName,
                avatarURL,
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
            sent = true;
        } else {
            await channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { parse: [] }
            });
            sent = true;
        }

        // 發送成功後才刪除原訊息
        if (sent) {
            try {
                await message.delete();
            } catch (delErr) {
                console.error(`[防爆雷按鈕] 刪除原訊息失敗: ${delErr.message}`);
            }
        }

        await interaction.editReply({ content: '🕶️ 已套用防爆雷' });

    } catch (error) {
        console.error(`[防爆雷按鈕] 處理失敗:`, error);
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: `❌ 防爆雷處理失敗：${error.message}` });
            }
        } catch (replyError) {
            console.error(`[防爆雷按鈕] 回覆錯誤失敗:`, replyError.message);
        }
    }
}

module.exports = {
    handleSpoilerButtonInteraction,
    handleSpoilerModalSubmit
};
