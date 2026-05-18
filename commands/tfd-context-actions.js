const {
    ApplicationCommandType, ContextMenuCommandBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    StringSelectMenuBuilder, MessageFlags
} = require('discord.js');
const db = require('../db');
const tlog = require('../utils/tfd-logger');
const { buildSpoilerComponents, sendSpoilerAndCleanup } = require('../src/features/spoilers/interactions/spoiler-buttons');
const { getInstance: getGBM } = require('../utils/guild-blacklist-manager');
const { resolveAuthorId, detectPlatformFromUrl, extractUrlFromMessage } = require('../src/shared/discord/message-helpers');
const { recallCounts, RECALL_LIMIT_MS, RECALL_LIMIT_COUNT, checkRecallLimit } = require('../src/features/reports/recall-limiter');

const cooldowns = new Map();
const COOLDOWN_MS = 60_000;

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setType(ApplicationCommandType.Message)
        .setName('PekoEmbed 操作')
        .setDMPermission(false),

    async execute(interaction) {
        if (!interaction.isContextMenuCommand()) return;
        if (interaction.commandName !== 'PekoEmbed 操作') return;

        const userId = interaction.user.id;
        const last = cooldowns.get(userId);
        if (last && Date.now() - last < COOLDOWN_MS) {
            return interaction.reply({ content: '操作冷卻中，請稍候再試', flags: MessageFlags.Ephemeral });
        }
        cooldowns.set(userId, Date.now());

        const targetMsg = await interaction.channel.messages.fetch(interaction.targetId).catch(() => null);
        if (!targetMsg) return interaction.reply({ content: '無法取得目標訊息', flags: MessageFlags.Ephemeral });
        if (!targetMsg.webhookId && !targetMsg.author.bot) {
            return interaction.reply({ content: '此訊息非 PekoEmbed 轉發訊息', flags: MessageFlags.Ephemeral });
        }

        const chId = interaction.channelId;
        const msgId = targetMsg.id;
        const originalAuthorId = resolveAuthorId(targetMsg);
        const isAuthor = !originalAuthorId || originalAuthorId === userId;
        const blacklistEnabled = db.guilds.isBlacklistEnabled(interaction.guildId);

        const btnRow = [
            ...(isAuthor ? [new ButtonBuilder().setCustomId(`ctx_delete_${chId}_${msgId}`).setLabel('移除訊息').setStyle(ButtonStyle.Danger)] : []),
            new ButtonBuilder().setCustomId(`ctx_spoiler_${chId}_${msgId}`).setLabel('上防爆雷').setStyle(ButtonStyle.Secondary),
            ...(blacklistEnabled ? [new ButtonBuilder().setCustomId(`ctx_report_${chId}_${msgId}`).setLabel('黑名單回報').setStyle(ButtonStyle.Secondary)] : [])
        ];
        const note = isAuthor ? '' : '\n⚠️ 只有原作者可以收回此訊息';
        await interaction.reply({
            content: '**PekoEmbed 操作選單**' + note,
            components: [new ActionRowBuilder().addComponents(...btnRow)],
            flags: MessageFlags.Ephemeral
        });
    },

    async handleContextButton(interaction) {
        const id = interaction.customId;
        if (id.startsWith('ctx_delete_')) return handleContextDelete(interaction);
        if (id.startsWith('ctx_spoiler_')) return handleContextSpoiler(interaction);
        if (id.startsWith('ctx_report_nowarn_')) return handleContextReportNoWarn(interaction);
        if (id.startsWith('ctx_report_')) return handleContextReport(interaction);
    },

    async handleContextModal(interaction) {
        const id = interaction.customId;
        if (id.startsWith('ctx_delete_modal_')) return handleDeleteModalSubmit(interaction);
        if (id.startsWith('ctx_spoiler_modal_')) return handleSpoilerModalSubmit(interaction);
        if (id.startsWith('ctx_report_modal_')) return handleReportModalSubmit(interaction);
    }
};

function parseCtxId(customId) {
    const p = customId.split('_');
    return { channelId: p[p.length - 2], messageId: p[p.length - 1] };
}

async function sendLogEmbed(interaction, embed) {
    const gs = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
    if (!gs?.log_channel_id) return;
    const lc = await interaction.client.channels.fetch(gs.log_channel_id).catch(() => null);
    if (!lc) return;
    await lc.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

// ── 收回訊息 ──

async function handleContextDelete(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.reply({ content: '目標訊息已不存在', flags: MessageFlags.Ephemeral });
    if (!t.webhookId) return interaction.reply({ content: '僅限 Webhook 轉發訊息才能使用收回功能', flags: MessageFlags.Ephemeral });

    const userId = interaction.user.id;
    if (!checkRecallLimit(userId)) {
        return interaction.reply({ content: '你已達收回次數上限（每 10 分鐘 3 次）', flags: MessageFlags.Ephemeral });
    }

    const originalAuthorId = resolveAuthorId(t);
    if (originalAuthorId && originalAuthorId !== userId) {
        return interaction.reply({ content: '只有原作者可以收回訊息', flags: MessageFlags.Ephemeral });
    }

    if (originalAuthorId && originalAuthorId === userId) {
        await t.delete().catch(() => {});
        try { db.tfdStats.record('recall', interaction.guildId, userId); } catch (_) {}
        tlog.log('CtxMenu-收回', interaction, '收回了自己的轉發訊息');
        await sendLogEmbed(interaction, {
            color: 0xED4245,
            description: `🗑️ <@${userId}> 收回了自己的轉發訊息`,
            fields: [{ name: '頻道', value: `<#${interaction.channelId}>`, inline: true }],
            timestamp: new Date().toISOString()
        });
        return interaction.reply({ content: '已收回訊息', flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
        .setCustomId(`ctx_delete_modal_${channelId}_${messageId}`)
        .setTitle('收回訊息理由')
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('請輸入收回理由（可空白）')
                .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)
        ));
    return interaction.showModal(modal);
}

async function handleDeleteModalSubmit(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const reason = interaction.fields.getTextInputValue('reason') || '';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.editReply({ content: '目標訊息已不存在' });
    if (!t.webhookId) return interaction.editReply({ content: '僅限 Webhook 轉發訊息才能使用收回功能' });

    const authorId = resolveAuthorId(t);
    if (authorId && authorId !== interaction.user.id) {
        return interaction.editReply({ content: '只有原作者可以收回訊息' });
    }

    await t.delete().catch(() => {});
    tlog.log('CtxMenu-收回', interaction, `移除訊息 (理由: ${reason || '無'})`);

    const ad = authorId ? `<@${authorId}>` : '未知用戶';
    await sendLogEmbed(interaction, {
        color: 0xED4245,
        description: `🗑️ <@${interaction.user.id}> 移除了 ${ad} 的轉發訊息`,
        fields: [
            { name: '頻道', value: `<#${interaction.channelId}>`, inline: true },
            { name: '理由', value: reason || '（無）', inline: true }
        ],
        timestamp: new Date().toISOString()
    });
    return interaction.editReply({ content: '✅ 已移除訊息' });
}

// ── 防爆雷 ──

async function handleContextSpoiler(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.reply({ content: '目標訊息已不存在', flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder()
        .setCustomId(`ctx_spoiler_modal_${channelId}_${messageId}`)
        .setTitle('上防爆雷')
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('請輸入理由（可空白）')
                .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)
        ));
    return interaction.showModal(modal);
}

async function handleSpoilerModalSubmit(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const reason = interaction.fields.getTextInputValue('reason') || '';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.editReply({ content: '目標訊息已不存在' });

    const { container, originalAuthorId } = buildSpoilerComponents(t, { operatorId: interaction.user.id, reason });
    tlog.log('CtxMenu-防爆雷', interaction, `對 ${originalAuthorId || '未知'} 的訊息套用防爆雷`);

    const td = originalAuthorId ? `<@${originalAuthorId}>` : '未知用戶';
    await sendLogEmbed(interaction, {
        color: 0x5865F2,
        description: `🕶️ <@${interaction.user.id}> 對 ${td} 的訊息使用了防爆雷`,
        fields: [
            { name: '頻道', value: `<#${interaction.channelId}>`, inline: true },
            { name: '理由', value: reason || '（無）', inline: false }
        ],
        timestamp: new Date().toISOString()
    });
    await sendSpoilerAndCleanup(t, container);
    try { db.tfdStats.record('anti_spoiler', interaction.guildId, interaction.user.id); } catch (_) {}
    return interaction.editReply({ content: '🕶️ 已套用防爆雷' });
}

// ── 黑名單回報 ──

async function handleContextReport(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    if (!db.guilds.isBlacklistEnabled(interaction.guildId)) {
        return interaction.reply({ content: '⚠️ 本功能尚未啟用（管理員請使用 /pe blacklist switch on 開啟）', flags: MessageFlags.Ephemeral });
    }

    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.reply({ content: '目標訊息已不存在', flags: MessageFlags.Ephemeral });

    const gs = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
    if (!gs || !gs.log_channel_id) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ctx_report_nowarn_${channelId}_${messageId}`).setLabel('確認送出').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({
            content: '此伺服器未設定日誌頻道，回報內容（含作者帳號、理由）將顯示在當前頻道，所有人可見。確定繼續？',
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }
    return showReportModal(interaction, channelId, messageId);
}

async function handleContextReportNoWarn(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    return showReportModal(interaction, channelId, messageId);
}

function showReportModal(interaction, channelId, messageId) {
    const modal = new ModalBuilder()
        .setCustomId(`ctx_report_modal_${channelId}_${messageId}`)
        .setTitle('黑名單回報')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('level').setLabel('請輸入等級 (1=僅提示, 2=防爆雷, 3=封鎖)')
                    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1).setPlaceholder('1 / 2 / 3')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('reason').setLabel('回報理由（可空白）')
                    .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)
            )
        );
    return interaction.showModal(modal);
}

async function handleReportModalSubmit(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const lv = parseInt(interaction.fields.getTextInputValue('level').trim(), 10);
    if (![1, 2, 3].includes(lv)) {
        return interaction.reply({ content: '等級必須是 1、2 或 3', flags: MessageFlags.Ephemeral });
    }

    const reason = interaction.fields.getTextInputValue('reason') || '';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    const ou = t ? extractUrlFromMessage(t) : '';
    const plat = detectPlatformFromUrl(ou);
    const ta = t ? resolveAuthorId(t) : null;

    const gbm = getGBM();
    const rid = gbm.createReport({
        guildId: interaction.guildId, channelId, messageId,
        originalUrl: ou, targetAuthor: ta, platform: plat,
        reporterId: interaction.user.id, suggestedLevel: lv, reason
    });
    tlog.log('CtxMenu-黑名單回報', interaction, `回報 #${rid} (${plat}, 等級 ${lv})`);

    const gs = db.guilds.get(interaction.guildId);
    if (gs?.log_channel_id) {
        const lc = await interaction.client.channels.fetch(gs.log_channel_id).catch(() => null);
        if (lc) {
            const sel = new StringSelectMenuBuilder()
                .setCustomId(`rbl_level_${rid}`).setPlaceholder('選擇審核等級')
                .addOptions(
                    { label: '1 - 僅提示', value: '1' },
                    { label: '2 - 防爆雷', value: '2' },
                    { label: '3 - 封鎖', value: '3' }
                );
            const bRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rbl_confirm_${rid}`).setLabel('確認核准').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`rbl_reject_${rid}`).setLabel('拒絕').setStyle(ButtonStyle.Danger)
            );
            const rmsg = await lc.send({
                embeds: [{
                    color: 0xFEE75C, title: `黑名單回報 #${rid}`,
                    fields: [
                        { name: '回報者', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '平台', value: plat, inline: true },
                        { name: '作者', value: ta || '未知', inline: true },
                        { name: '建議等級', value: String(lv), inline: true },
                        { name: '原始 URL', value: ou || '無' },
                        { name: '理由', value: reason || '（無）' }
                    ],
                    timestamp: new Date().toISOString()
                }],
                components: [new ActionRowBuilder().addComponents(sel), bRow]
            });
            db.blacklistReports.setLogMessageId(rid, rmsg.id);
        }
    }
    return interaction.editReply({ content: '✅ 已送出回報，等待管理員審核' });
}
