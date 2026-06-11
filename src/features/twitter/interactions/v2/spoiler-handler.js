const {
    ActionRowBuilder,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    ModalBuilder,
    SeparatorBuilder,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { resolveTweetBundle } = require('./tweet-data');
const db = require('../../../../../db');
const tlog = require('../../../../../utils/tfd-logger');
const { extractTweetId, extractMarkerTextFromMessage } = require('./shared');

async function handleV2Spoiler(interaction) {
    const tweetId = extractTweetId(interaction.customId);
    const messageId = interaction.message.id;
    const modal = new ModalBuilder()
        .setCustomId(`v2_spoiler_modal_${tweetId}_${messageId}`)
        .setTitle('標記防爆雷')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('spoiler_reason')
                    .setLabel('請輸入防爆雷原因')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('例如：劇情雷、活動雷、敏感內容')
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
        await interaction.editReply({ content: '找不到原始訊息，無法套用防爆雷。' });
        return;
    }

    await sendSpoilerLog(interaction, tweetId, operatorId, reason);

    const cached = await resolveTweetBundle(tweetId);
    const markerText = extractMarkerTextFromMessage(message);
    const spoilerContainer = buildSpoilerContainer(cached, markerText, operatorId, reason);

    const { sendWithWebhook, canUseWebhook, hasWebhookPermission } = require('../../../../../utils/webhook-manager.js');
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
        tlog.sysError('V2-Spoiler', `傳送防爆雷訊息失敗: ${error.message}`);
    }

    if (sent) {
        try {
            await message.delete();
        } catch (error) {
            tlog.sysError('V2-Spoiler', `刪除原始訊息失敗: ${error.message}`);
        }
    }

    await interaction.editReply({ content: sent ? '已套用防爆雷。' : '防爆雷處理失敗，請稍後再試。' });
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
                description: `Twitter V2 防爆雷標記：\`${tweetId}\``,
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

module.exports = {
    handleV2Spoiler,
    handleV2SpoilerModalSubmit,
    buildSpoilerContainer
};
