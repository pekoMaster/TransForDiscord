/**
 * Report button interactions — unified handler
 *
 * Routes:
 *   Button: report_btn_{ts}            → main [回報] click → ephemeral submenu
 *   Button: report_spoiler_{ch}{msg}_{ts}     → [上防爆雷] → modal
 *   Button: report_recall_{ch}{msg}_{ts}      → [收回訊息]
 *   Button: report_blacklist_{ch}{msg}_{ts}   → [黑名單回報]
 *   Button: report_bl_nowarning_{ch}{msg}_{ts} → no-log confirm
 *   Button: rbl_confirm_{reportId}     → admin approve
 *   Button: rbl_reject_{reportId}      → admin reject
 *   Select: rbl_level_{reportId}       → admin pick level
 *
 *   Modal:  report_spoiler_modal_{ch}{msg}    → spoiler reason
 *   Modal:  report_recall_modal_{ch}{msg}     → recall reason
 *   Modal:  report_blacklist_modal_{ch}{msg}_{ts} → blacklist report
 *   Modal:  rbl_admin_modal_{reportId}  → admin approve reason
 */

const {
    MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    StringSelectMenuBuilder, EmbedBuilder
} = require('discord.js');
const db = require('../../../../db');
const { buildSpoilerComponents, sendSpoilerAndCleanup } = require('../../spoilers/interactions/spoiler-buttons');
const { getInstance: getGBM } = require('../../../../utils/guild-blacklist-manager');
const { resolveAuthorId, detectPlatformFromUrl, extractUrlFromMessage } = require('../../../shared/discord/message-helpers');
const { checkRecallLimit } = require('../recall-limiter');

const BTN_EXPIRE_MS = 86_400_000;
const SUBMENU_EXPIRE_MS = 60_000;
const COOLDOWN_MS = 0;
const cooldowns = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of cooldowns) { if (now - v > COOLDOWN_MS * 24) cooldowns.delete(k); }
}, 60_000).unref();

// ── Helpers ────────────────────────────────────────────

function parseId(customId, prefix) {
    return customId.slice(prefix.length);
}

function parseChMsg(customId) {
    // Format: {prefix}_{chId}_{msgId}_{subTs}
    const parts = customId.split('_');
    const l = parts.length;
    return {
        channelId: parts[l - 3],
        messageId: parts[l - 2],
        subTs: parseInt(parts[l - 1], 10)
    };
}

function isExpired(ts) {
    return Date.now() - ts > BTN_EXPIRE_MS;
}

function checkCooldown(userId) {
    return false;
}

// ── Main Router ──────────────────────────────────────

async function routeReportInteraction(interaction) {
    if (interaction.isButton()) return routeButton(interaction);
    if (interaction.isModalSubmit()) return routeModal(interaction);
    if (interaction.isStringSelectMenu()) return routeSelect(interaction);
}

// ── Button Routes ────────────────────────────────────

async function routeButton(interaction) {
    const id = interaction.customId;

    if (id.startsWith('report_btn_')) return handleMainButton(interaction);
    if (id.startsWith('report_spoiler_')) return handleSpoilerSubmenu(interaction);
    if (id.startsWith('report_recall_')) return handleRecallSubmenu(interaction);
    if (id.startsWith('report_blacklist_')) return handleBlacklistSubmenu(interaction);
    if (id.startsWith('report_bl_nowarning_')) return handleBlacklistNoWarning(interaction);
    if (id.startsWith('rbl_confirm_')) return handleAdminApprove(interaction);
    if (id.startsWith('rbl_reject_')) return handleAdminReject(interaction);
}

// ── Main [回報] Button ──────────────────────────────

async function handleMainButton(interaction) {
    const ts = parseInt(parseId(interaction.customId, 'report_btn_'), 10);
    if (isExpired(ts)) {
        return interaction.reply({ content: '⏰ 此按鈕已失效（訊息超過 60 秒）', flags: MessageFlags.Ephemeral });
    }
    if (checkCooldown(interaction.user.id)) {
        return interaction.reply({ content: '⏳ 操作冷卻中，請稍候', flags: MessageFlags.Ephemeral });
    }

    const channelId = interaction.channelId;
    const messageId = interaction.message.id;
    const subTs = Date.now();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`report_spoiler_${channelId}_${messageId}_${subTs}`).setLabel('上防爆雷').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`report_recall_${channelId}_${messageId}_${subTs}`).setLabel('縮回訊息').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`report_blacklist_${channelId}_${messageId}_${subTs}`).setLabel('黑名單回報').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ content: '請選擇操作：', components: [row], flags: MessageFlags.Ephemeral });
}

// ── [上防爆雷] Submenu ──────────────────────────────

async function handleSpoilerSubmenu(interaction) {
    const { channelId, messageId, subTs } = parseChMsg(interaction.customId);
    if (Date.now() - subTs > SUBMENU_EXPIRE_MS) {
        return interaction.update({ content: '⏰ 操作已逾時', components: [], flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
        .setCustomId(`report_spoiler_modal_${channelId}_${messageId}`)
        .setTitle('防爆雷理由')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('spoiler_reason')
                    .setLabel('請輸入防爆雷的理由（可空白）')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(100)
            )
        );

    await interaction.showModal(modal);
}

// ── [收回訊息] Submenu ───────────────────────────────

async function handleRecallSubmenu(interaction) {
    const { channelId, messageId, subTs } = parseChMsg(interaction.customId);
    if (isExpired(subTs)) {
        return interaction.update({ content: '⏰ 操作已逾時', components: [], flags: MessageFlags.Ephemeral });
    }

    if (!checkRecallLimit(interaction.user.id)) {
        return interaction.reply({ content: '⚠️ 你已達收回次數上限（每 10 分鐘 3 次）', flags: MessageFlags.Ephemeral });
    }

    // Fetch target message
    let targetMsg;
    try {
        const channel = await interaction.client.channels.fetch(channelId);
        targetMsg = await channel.messages.fetch(messageId);
    } catch (e) {
        return interaction.reply({ content: '❌ 原始訊息已不存在或無法存取', flags: MessageFlags.Ephemeral });
    }

    const originalAuthorId = resolveAuthorId(targetMsg);

    // Non-author: block
    if (originalAuthorId && originalAuthorId !== interaction.user.id) {
        return interaction.reply({ content: '只有原作者可以收回訊息', flags: MessageFlags.Ephemeral });
    }

    // If caller is the original author: delete directly
    if (originalAuthorId && originalAuthorId === interaction.user.id) {
        await targetMsg.delete().catch(() => {});
        try { db.tfdStats.record('recall', interaction.guildId, interaction.user.id); } catch (_) {}
        await logRecall(interaction, targetMsg, originalAuthorId, null);
        return interaction.update({ content: '✅ 已收回訊息', components: [], flags: MessageFlags.Ephemeral });
    }

    // Not original author: show modal for reason
    const modal = new ModalBuilder()
        .setCustomId(`report_recall_modal_${channelId}_${messageId}`)
        .setTitle('收回訊息理由')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('recall_reason')
                    .setLabel('請輸入收回理由（可空白）')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(200)
            )
        );

    await interaction.showModal(modal);
}

// ── [黑名單回報] Submenu ─────────────────────────────

async function handleBlacklistSubmenu(interaction) {
    const { channelId, messageId, subTs } = parseChMsg(interaction.customId);
    if (isExpired(subTs)) {
        return interaction.update({ content: '⏰ 操作已逾時', components: [], flags: MessageFlags.Ephemeral });
    }

    if (!db.guilds.isBlacklistEnabled(interaction.guildId)) {
        return interaction.reply({ content: '⚠️ 本功能尚未啟用（管理員請使用 /pe blacklist switch on 開啟）', flags: MessageFlags.Ephemeral });
    }

    const guildSettings = db.guilds.get(interaction.guildId);
    if (!guildSettings?.log_channel_id) {
        // No log channel: show warning
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`report_bl_nowarning_${channelId}_${messageId}_${Date.now()}`).setLabel('確認送出').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({
            content: '⚠️ 此伺服器未設定日誌頻道，回報內容（含作者帳號、理由）將顯示在當前頻道，所有人可見。確定繼續？',
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }

    return showBlacklistModal(interaction, channelId, messageId);
}

async function handleBlacklistNoWarning(interaction) {
    const { channelId, messageId } = parseChMsg(interaction.customId);
    return showBlacklistModal(interaction, channelId, messageId);
}

function showBlacklistModal(interaction, channelId, messageId) {
    const modal = new ModalBuilder()
        .setCustomId(`report_blacklist_modal_${channelId}_${messageId}_${Date.now()}`)
        .setTitle('黑名單回報')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('bl_level')
                    .setLabel('請輸入等級 (1=僅提示, 2=防爆雷, 3=封鎖)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(1)
                    .setPlaceholder('1 / 2 / 3')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('bl_reason')
                    .setLabel('回報理由（可空白，最多 200 字）')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(200)
            )
        );

    return interaction.showModal(modal);
}

// ── Admin Review ─────────────────────────────────────

async function handleAdminApprove(interaction) {
    return handleAdminAction(interaction, 'confirm');
}

async function handleAdminReject(interaction) {
    return handleAdminAction(interaction, 'reject');
}

async function handleAdminAction(interaction, action) {
    const reportId = parseInt(parseId(interaction.customId, action === 'confirm' ? 'rbl_confirm_' : 'rbl_reject_'), 10);
    const gbm = getGBM();

    // Check auth
    if (!interaction.member.permissions.has('ManageGuild') && !interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ 你沒有權限執行此操作', flags: MessageFlags.Ephemeral });
    }

    const report = gbm.getReport(reportId);
    if (!report || report.status !== 'pending') {
        return interaction.reply({ content: '❌ 此回報已處理', flags: MessageFlags.Ephemeral });
    }

    if (action === 'confirm') {
        if (!report.final_level) {
            return interaction.reply({ content: '❌ 請先從下拉選單選擇等級', flags: MessageFlags.Ephemeral });
        }

        const modal = new ModalBuilder()
            .setCustomId(`rbl_admin_modal_${reportId}`)
            .setTitle('審核理由')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('admin_reason')
                        .setLabel('審核理由（可空白）')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setMaxLength(200)
                )
            );

        return interaction.showModal(modal);
    }

    // Reject
    gbm.rejectReport(reportId, interaction.user.id);
    await updateAdminMessage(interaction, report, 'rejected', interaction.user.id);
    return interaction.reply({ content: '❌ 已拒絕此回報', flags: MessageFlags.Ephemeral });
}

// ── Modal Routes ─────────────────────────────────────

async function routeModal(interaction) {
    const id = interaction.customId;

    if (id.startsWith('report_spoiler_modal_')) return handleSpoilerModal(interaction);
    if (id.startsWith('report_recall_modal_')) return handleRecallModal(interaction);
    if (id.startsWith('report_blacklist_modal_')) return handleBlacklistModal(interaction);
    if (id.startsWith('rbl_admin_modal_')) return handleAdminModal(interaction);
}

async function handleSpoilerModal(interaction) {
    const parts = interaction.customId.split('_');
    const channelId = parts[3];
    const messageId = parts[4];
    const reason = interaction.fields.getTextInputValue('spoiler_reason') || '';
    const operatorId = interaction.user.id;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let targetMessage;
    try {
        const channel = await interaction.client.channels.fetch(channelId);
        targetMessage = await channel.messages.fetch(messageId);
    } catch (e) {
        return interaction.editReply({ content: '❌ 原始訊息已不存在' });
    }

    const { container, originalAuthorId } = buildSpoilerComponents(targetMessage, { operatorId, reason });

    // Log
    try {
        const guildSettings = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
        if (guildSettings?.log_channel_id) {
            const logChannel = await interaction.client.channels.fetch(guildSettings.log_channel_id).catch(() => null);
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
    } catch (_) {}

    await sendSpoilerAndCleanup(targetMessage, container);
    try { db.tfdStats.record('anti_spoiler', interaction.guildId, interaction.user.id); } catch (_) {}
    return interaction.editReply({ content: '🕶️ 已套用防爆雷' });
}

async function handleRecallModal(interaction) {
    const parts = interaction.customId.split('_');
    const channelId = parts[3];
    const messageId = parts[4];
    const reason = interaction.fields.getTextInputValue('recall_reason') || '';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let targetMsg;
    try {
        const channel = await interaction.client.channels.fetch(channelId);
        targetMsg = await channel.messages.fetch(messageId);
    } catch (e) {
        return interaction.editReply({ content: '❌ 原始訊息已不存在' });
    }

    const originalAuthorId = resolveAuthorId(targetMsg);
    if (originalAuthorId && originalAuthorId !== interaction.user.id) return interaction.editReply({ content: '只有原作者可以收回訊息' });
    await targetMsg.delete().catch(() => {});
    try { db.tfdStats.record('recall', interaction.guildId, interaction.user.id); } catch (_) {}
    await logRecall(interaction, targetMsg, originalAuthorId, reason);
    return interaction.editReply({ content: '✅ 已收回訊息' });
}

async function logRecall(interaction, targetMsg, originalAuthorId, reason) {
    const guildSettings = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
    const logChannelId = guildSettings?.log_channel_id;
    const targetChannel = logChannelId
        ? await interaction.client.channels.fetch(logChannelId).catch(() => null)
        : null;
    if (!targetChannel) return;

    {
        const authorDesc = originalAuthorId ? `<@${originalAuthorId}>` : '未知用戶';
        await targetChannel.send({
            embeds: [{
                color: 0xED4245,
                description: `🗑️ <@${interaction.user.id}> 收回了 ${authorDesc} 的訊息`,
                fields: [
                    { name: '頻道', value: `<#${interaction.channelId}>`, inline: true },
                    { name: '理由', value: reason || '（無）', inline: true },
                    { name: '原始連結', value: targetMsg.url || '已刪除，無法點擊' },
                ],
                timestamp: new Date().toISOString(),
            }],
            allowedMentions: { parse: [] }
        });
    }
}

async function handleBlacklistModal(interaction) {
    const parts = interaction.customId.split('_');
    const channelId = parts[3];
    const messageId = parts[4];

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const levelStr = interaction.fields.getTextInputValue('bl_level').trim();
    const level = parseInt(levelStr, 10);
    if (![1, 2, 3].includes(level)) {
        return interaction.editReply({ content: '❌ 等級必須是 1、2 或 3' });
    }

    const reason = interaction.fields.getTextInputValue('bl_reason') || '';

    // Try to get author from message
    let targetMsg = null;
    let targetAuthor = null;
    let originalUrl = '';

    try {
        const channel = await interaction.client.channels.fetch(channelId);
        targetMsg = await channel.messages.fetch(messageId);
        targetAuthor = resolveAuthorId(targetMsg);
        originalUrl = extractUrlFromMessage(targetMsg);
    } catch (_) {}

    const platform = detectPlatformFromUrl(originalUrl);

    const gbm = getGBM();
    const reportId = gbm.createReport({
        guildId: interaction.guildId,
        channelId,
        messageId,
        originalUrl,
        targetAuthor,
        platform,
        reporterId: interaction.user.id,
        suggestedLevel: level,
        reason
    });

    // Send admin review message
    const guildSettings = db.guilds.get(interaction.guildId);
    const logChannelId = guildSettings?.log_channel_id;
    const reviewChannel = logChannelId
        ? await interaction.client.channels.fetch(logChannelId).catch(() => null)
        : interaction.channel;

    if (reviewChannel) {
        const levelSelect = new StringSelectMenuBuilder()
            .setCustomId(`rbl_level_${reportId}`)
            .setPlaceholder('選擇審核等級')
            .addOptions(
                { label: '1 — 僅提示', value: '1' },
                { label: '2 — 防爆雷', value: '2' },
                { label: '3 — 封鎖', value: '3' }
            );

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rbl_confirm_${reportId}`).setLabel('✅ 確認核准').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`rbl_reject_${reportId}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger)
        );

        const reviewMsg = await reviewChannel.send({
            embeds: [{
                color: 0xFEE75C,
                title: `📋 黑名單回報 #${reportId}`,
                fields: [
                    { name: '回報者', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '平台', value: platform, inline: true },
                    { name: '作者', value: targetAuthor || '未知', inline: true },
                    { name: '建議等級', value: `${level}`, inline: true },
                    { name: '原始 URL', value: originalUrl || '無' },
                    { name: '理由', value: reason || '（無）' },
                ],
                timestamp: new Date().toISOString(),
            }],
            components: [new ActionRowBuilder().addComponents(levelSelect), buttonRow]
        });

        db.blacklistReports.setLogMessageId(reportId, reviewMsg.id);
    }

    return interaction.editReply({ content: '✅ 已送出回報，等待管理員審核' });
}

async function handleAdminModal(interaction) {
    const reportId = parseInt(parseId(interaction.customId, 'rbl_admin_modal_'), 10);
    const adminReason = interaction.fields.getTextInputValue('admin_reason') || '';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gbm = getGBM();
    const report = gbm.getReport(reportId);
    if (!report || report.status !== 'pending') {
        return interaction.editReply({ content: '❌ 此回報已處理' });
    }

    gbm.approveReport(reportId, interaction.user.id, report.final_level, adminReason);
    await updateAdminMessage(interaction, report, 'approved', interaction.user.id, report.final_level, adminReason);

    // Log admin action
    {
        const gls = db.guilds.get(report.guild_id);
        if (gls && gls.log_channel_id) {
            const lc = await interaction.client.channels.fetch(gls.log_channel_id).catch(() => null);
            if (lc) await lc.send({ content: '✅ <@' + interaction.user.id + '> 核准了黑名單回報 #' + reportId + '（等級 ' + report.final_level + '，備註：' + (adminReason || '無') + '）', allowedMentions: { parse: [] } });
        }
    }
return interaction.editReply({ content: `✅ 已核准回報（等級 ${report.final_level}）` });
}

async function updateAdminMessage(interaction, report, status, adminId, finalLevel = null, adminReason = null) {
    const logMessageId = report.log_message_id;
    if (!logMessageId) return;

    const guildSettings = db.guilds.get(report.guild_id);
    const logChannelId = guildSettings?.log_channel_id;
    const reviewChannel = logChannelId
        ? await interaction.client.channels.fetch(logChannelId).catch(() => null)
        : interaction.channel;

    if (!reviewChannel) return;

    try {
        const msg = await reviewChannel.messages.fetch(logMessageId);
        const embed = EmbedBuilder.from(msg.embeds[0]);
        const statusText = status === 'approved'
            ? `✅ 已核准 by <@${adminId}>，等級 ${finalLevel}，備註：${adminReason || '無'}`
            : `❌ 已拒絕 by <@${adminId}>`;

        embed.addFields({ name: '審核結果', value: statusText });
        embed.setColor(status === 'approved' ? 0x57F287 : 0xED4245);

        await msg.edit({ embeds: [embed], components: [] });
    } catch (_) {}
}

// ── Select Routes ────────────────────────────────────

async function routeSelect(interaction) {
    const id = interaction.customId;
    if (id.startsWith('rbl_level_')) {
        const reportId = parseInt(parseId(id, 'rbl_level_'), 10);
        const level = parseInt(interaction.values[0], 10);
        getGBM().setLevel(reportId, level);
        await interaction.deferUpdate();
    }
}

module.exports = { routeReportInteraction };
