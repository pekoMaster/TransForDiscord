const { ApplicationCommandType, ContextMenuCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../db');
const { buildSpoilerComponents, sendSpoilerAndCleanup } = require('../handlers/spoiler-button-interactions');
const { getInstance: getGBM } = require('../utils/guild-blacklist-manager');

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
        if (last && Date.now() - last < COOLDOWN_MS) return interaction.reply({ content: '操作冷卻中，請稍候再試', flags: MessageFlags.Ephemeral });
        cooldowns.set(userId, Date.now());
        const targetMsg = await interaction.channel.messages.fetch(interaction.targetId).catch(() => null);
        if (!targetMsg) return interaction.reply({ content: '無法取得目標訊息', flags: MessageFlags.Ephemeral });
        if (!targetMsg.webhookId && !targetMsg.author.bot) return interaction.reply({ content: '此訊息非 PekoEmbed 轉發訊息', flags: MessageFlags.Ephemeral });
        const chId = interaction.channelId, msgId = targetMsg.id;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ctx_delete_' + chId + '_' + msgId).setLabel('移除訊息').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ctx_spoiler_' + chId + '_' + msgId).setLabel('上防爆雷').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('ctx_report_' + chId + '_' + msgId).setLabel('黑名單回報').setStyle(ButtonStyle.Secondary));
        await interaction.reply({ content: '**PekoEmbed 操作選單**', components: [row], flags: MessageFlags.Ephemeral });
    },

    async handleContextButton(interaction) {
        const id = interaction.customId;
        if (id.startsWith('ctx_delete_')) return handleContextDelete(interaction);
        if (id.startsWith('ctx_spoiler_')) return handleContextSpoiler(interaction);
        if (id.startsWith('ctx_report_')) return handleContextReport(interaction);
    },

    async handleContextModal(interaction) {
        const id = interaction.customId;
        if (id.startsWith('ctx_delete_modal_')) return handleDeleteModalSubmit(interaction);
        if (id.startsWith('ctx_spoiler_modal_')) return handleSpoilerModalSubmit(interaction);
        if (id.startsWith('ctx_report_modal_')) return handleReportModalSubmit(interaction);
    }
};

function parseCtxId(customId) { const p = customId.split('_'); return { channelId: p[p.length - 2], messageId: p[p.length - 1] }; }
function extractAuthorFromMsg(c) { if (!c) return null; const ls = c.split('\n'); for (let i = ls.length - 1; i >= 0; i--) { const m = ls[i].match(/# <@!?(\d+)>/); if (m) return m[1]; } return null; }

async function handleContextDelete(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.reply({ content: '目標訊息已不存在', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('ctx_delete_modal_' + channelId + '_' + messageId).setTitle('移除訊息')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('請輸入移除理由（可空白）').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)));
    return interaction.showModal(modal);
}

async function handleDeleteModalSubmit(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const reason = interaction.fields.getTextInputValue('reason') || '';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.editReply({ content: '目標訊息已不存在' });
    const authorId = extractAuthorFromMsg(t.content);
    await t.delete().catch(() => {});
    const gs = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
    if (gs && gs.log_channel_id) {
        const lc = await interaction.client.channels.fetch(gs.log_channel_id).catch(() => null);
        if (lc) {
            const ad = authorId ? '<@' + authorId + '>' : '未知用戶';
            await lc.send({ embeds: [{ color: 0xED4245, description: '🗑️ <@' + interaction.user.id + '> 移除了 ' + ad + ' 的轉發訊息', fields: [{ name: '頻道', value: '<#' + interaction.channelId + '>', inline: true }, { name: '理由', value: reason || '（無）', inline: true }], timestamp: new Date().toISOString() }], allowedMentions: { parse: [] } });
        }
    }
    return interaction.editReply({ content: '✅ 已移除訊息' });
}

async function handleContextSpoiler(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.reply({ content: '目標訊息已不存在', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('ctx_spoiler_modal_' + channelId + '_' + messageId).setTitle('上防爆雷')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('請輸入理由（可空白）').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)));
    return interaction.showModal(modal);
}

async function handleSpoilerModalSubmit(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const reason = interaction.fields.getTextInputValue('reason') || '';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.editReply({ content: '目標訊息已不存在' });
    const { container, originalAuthorId } = buildSpoilerComponents(t, { operatorId: interaction.user.id, reason });
    const gs = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
    if (gs && gs.log_channel_id) {
        const lc = await interaction.client.channels.fetch(gs.log_channel_id).catch(() => null);
        if (lc) { const td = originalAuthorId ? '<@' + originalAuthorId + '>' : '未知用戶'; await lc.send({ embeds: [{ color: 0x5865F2, description: '🕶️ <@' + interaction.user.id + '> 對 ' + td + ' 的訊息使用了防爆雷', fields: [{ name: '頻道', value: '<#' + interaction.channelId + '>', inline: true }, { name: '理由', value: reason || '（無）', inline: false }], timestamp: new Date().toISOString() }], allowedMentions: { parse: [] } }); }
    }
    await sendSpoilerAndCleanup(t, container);
    return interaction.editReply({ content: '🕶️ 已套用防爆雷' });
}

async function handleContextReport(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!t) return interaction.reply({ content: '目標訊息已不存在', flags: MessageFlags.Ephemeral });
    const gs = interaction.guildId ? db.guilds.get(interaction.guildId) : null;
    if (!gs || !gs.log_channel_id) return interaction.reply({ content: '此伺服器未設定日誌頻道，請先使用 /pe log add 設定', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('ctx_report_modal_' + channelId + '_' + messageId).setTitle('黑名單回報')
        .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('level').setLabel('請輸入等級 (1=僅提示, 2=防爆雷, 3=封鎖)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1).setPlaceholder('1 / 2 / 3')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('回報理由（可空白）').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200))
        );
    return interaction.showModal(modal);
}

async function handleReportModalSubmit(interaction) {
    const { channelId, messageId } = parseCtxId(interaction.customId);
    const lv = parseInt(interaction.fields.getTextInputValue('level').trim(), 10);
    if (![1,2,3].includes(lv)) return interaction.reply({ content: '等級必須是 1、2 或 3', flags: MessageFlags.Ephemeral });
    const reason = interaction.fields.getTextInputValue('reason') || '';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = await interaction.channel.messages.fetch(messageId).catch(() => null);
    let ta = null, plat = 'unknown', ou = '';
    if (t) { ta = extractAuthorFromMsg(t.content); const um = (t.content||'').match(/https?:\/\/[^\s<>"]+/i); if (um) { ou=um[0]; if (ou.includes('twitter.com')) plat='twitter'; else if (ou.includes('pixiv.net')) plat='pixiv'; else if (ou.includes('youtube.com')) plat='youtube'; else if (ou.includes('instagram.com')) plat='instagram'; else if (ou.includes('threads.com')) plat='threads'; } }
    const gbm = getGBM();
    const rid = gbm.createReport({ guildId: interaction.guildId, channelId, messageId, originalUrl: ou, targetAuthor: ta, platform: plat, reporterId: interaction.user.id, suggestedLevel: lv, reason });
    const gs = db.guilds.get(interaction.guildId);
    if (gs && gs.log_channel_id) {
        const lc = await interaction.client.channels.fetch(gs.log_channel_id).catch(() => null);
        if (lc) {
            const { StringSelectMenuBuilder } = require('discord.js');
            const sel = new StringSelectMenuBuilder().setCustomId('rbl_level_'+rid).setPlaceholder('選擇審核等級').addOptions({label:'1 - 僅提示',value:'1'},{label:'2 - 防爆雷',value:'2'},{label:'3 - 封鎖',value:'3'});
            const bRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rbl_confirm_'+rid).setLabel('確認核准').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('rbl_reject_'+rid).setLabel('拒絕').setStyle(ButtonStyle.Danger));
            const ad = ta || '未知';
            const rmsg = await lc.send({ embeds: [{ color: 0xFEE75C, title: '黑名單回報 #'+rid, fields: [{ name: '回報者', value: '<@'+interaction.user.id+'>', inline: true },{ name: '平台', value: plat, inline: true },{ name: '作者', value: ad, inline: true },{ name: '建議等級', value: String(lv), inline: true },{ name: '原始 URL', value: ou||'無' },{ name: '理由', value: reason||'（無）' }], timestamp: new Date().toISOString() }], components: [new ActionRowBuilder().addComponents(sel), bRow] });
            db.getDB().prepare('UPDATE blacklist_reports SET log_message_id = ? WHERE id = ?').run(rmsg.id, rid);
        }
    }
    return interaction.editReply({ content: '✅ 已送出回報，等待管理員審核' });
}