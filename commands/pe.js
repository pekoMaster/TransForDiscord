/**
 * Peko Embed 系統管理指令（公開版 v2 — SQLite 多租戶）
 *
 * 子指令群：
 *   /pe api add|edit|del|status   — 管理個人 AI API Key（所有用戶；加密儲存）
 *   /pe log add|edit|del          — 管理本伺服器日誌頻道（管理員）
 *   /pe log show                  — 查看本伺服器日誌頻道設定（管理員）
 *   /pe nouser                    — 排除使用者（管理員，per-guild）
 *   /pe noch                      — 排除頻道（管理員，per-guild）
 *   /pe owner                     — 設定本伺服器活動 owner（管理員）
 *   /pe status                    — 查看本伺服器 Peko Embed 狀態（管理員）
 *
 * 多租戶設計：
 *   - log_channel / blocked_channels / excluded_users / owner 全部 per-guild
 *   - api_keys 加密後儲存於 SQLite（per-user 全域，使用者設定一次即跨伺服器可用）
 */

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');

const db = require('../db');
const { PROVIDERS, saveKey, removeKey, getKeyStatus, hasAnyKey } = require('../utils/user-api-key-storage.js');

const PROVIDER_CHOICES = [
    { name: 'OpenAI', value: 'openai' },
    { name: 'Claude (Anthropic)', value: 'claude' },
    { name: 'Gemini (Google)', value: 'gemini' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pe')
        .setDescription('Peko Embed 連結預覽系統管理')
        .setDMPermission(false)

        // ── /pe api（所有人）──
        .addSubcommandGroup(g => g
            .setName('api')
            .setDescription('管理你的個人 AI 翻譯 API Key（加密儲存）')
            .addSubcommand(s => s.setName('add').setDescription('新增 AI API Key')
                .addStringOption(o => o.setName('provider').setDescription('AI 服務商').setRequired(true).addChoices(...PROVIDER_CHOICES))
                .addStringOption(o => o.setName('apikey').setDescription('你的 API Key').setRequired(true))
            )
            .addSubcommand(s => s.setName('edit').setDescription('修改已設定的 API Key')
                .addStringOption(o => o.setName('provider').setDescription('AI 服務商').setRequired(true).addChoices(...PROVIDER_CHOICES))
                .addStringOption(o => o.setName('apikey').setDescription('新的 API Key').setRequired(true))
            )
            .addSubcommand(s => s.setName('del').setDescription('刪除已設定的 API Key')
                .addStringOption(o => o.setName('provider').setDescription('AI 服務商').setRequired(true).addChoices(...PROVIDER_CHOICES))
            )
            .addSubcommand(s => s.setName('status').setDescription('查看你的 API Key 設定狀態'))
        )

        // ── /pe log（管理員，per-guild）──
        .addSubcommandGroup(g => g
            .setName('log')
            .setDescription('管理本伺服器的日誌頻道（管理員）')
            .addSubcommand(s => s.setName('add').setDescription('設定日誌頻道')
                .addChannelOption(o => o.setName('channel').setDescription('日誌頻道').setRequired(true).addChannelTypes(ChannelType.GuildText))
            )
            .addSubcommand(s => s.setName('edit').setDescription('更換日誌頻道')
                .addChannelOption(o => o.setName('channel').setDescription('新的日誌頻道').setRequired(true).addChannelTypes(ChannelType.GuildText))
            )
            .addSubcommand(s => s.setName('del').setDescription('移除日誌頻道設定（停止發 log）'))
            .addSubcommand(s => s.setName('show').setDescription('查看目前日誌頻道設定'))
        )

        // ── /pe nouser（管理員，per-guild）──
        .addSubcommand(s => s.setName('nouser').setDescription('排除/恢復某使用者在本伺服器觸發預覽（管理員）')
            .addUserOption(o => o.setName('user').setDescription('要排除/恢復的使用者').setRequired(true))
            .addStringOption(o => o.setName('action').setDescription('操作').setRequired(true)
                .addChoices({ name: '新增排除', value: 'add' }, { name: '移除排除', value: 'remove' }, { name: '列表', value: 'list' })
            )
        )

        // ── /pe noch（管理員，per-guild）──
        .addSubcommand(s => s.setName('noch').setDescription('排除/恢復某頻道在本伺服器觸發預覽（管理員）')
            .addChannelOption(o => o.setName('channel').setDescription('要排除/恢復的頻道').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName('action').setDescription('操作').setRequired(true)
                .addChoices({ name: '新增排除', value: 'add' }, { name: '移除排除', value: 'remove' }, { name: '列表', value: 'list' })
            )
        )

        // ── /pe owner（管理員，per-guild）──
        .addSubcommand(s => s.setName('owner').setDescription('設定本伺服器的 Peko Embed 活動 owner（管理員專屬功能用）')
            .addUserOption(o => o.setName('user').setDescription('owner 使用者；不填則清除').setRequired(false))
        )

        // ── /pe status（管理員）──
        .addSubcommand(s => s.setName('status').setDescription('查看本伺服器 Peko Embed 狀態（管理員）')),

    async execute(interaction) {
        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // /pe api — 所有使用者
            if (group === 'api') {
                return await handleApi(interaction, sub, userId);
            }

            // 以下需要 ManageMessages 或 Administrator
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator)
                || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
            if (!isAdmin) {
                return interaction.reply({ content: '❌ 此指令需要 `管理伺服器` 或 `管理員` 權限', ephemeral: true });
            }

            if (!guildId) {
                return interaction.reply({ content: '❌ 此指令僅能在伺服器內使用', ephemeral: true });
            }

            // 確保此 guild 已登錄
            db.guilds.upsert({
                guildId,
                guildName: interaction.guild?.name || null
            });

            if (group === 'log') return await handleLog(interaction, sub, guildId);

            switch (sub) {
                case 'nouser': return await handleNoUser(interaction, guildId, userId);
                case 'noch': return await handleNoChannel(interaction, guildId, userId);
                case 'owner': return await handleOwner(interaction, guildId);
                case 'status': return await handleStatus(interaction, guildId);
            }

        } catch (error) {
            console.error('[/pe] 指令執行失敗:', error);
            const reply = { content: '❌ 執行指令時發生錯誤，請稍後再試。', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply).catch(() => {});
            } else {
                await interaction.reply(reply).catch(() => {});
            }
        }
    }
};

// ────────────────────────────────────────────────────────────
// /pe api
// ────────────────────────────────────────────────────────────
async function handleApi(interaction, sub, userId) {
    if (sub === 'add' || sub === 'edit') {
        const provider = interaction.options.getString('provider');
        const apiKey = interaction.options.getString('apikey').trim();
        const providerName = PROVIDERS[provider]?.name || provider;
        const prefix = PROVIDERS[provider]?.prefix;

        if (prefix && !apiKey.startsWith(prefix)) {
            return interaction.reply({
                content: `⚠️ ${providerName} 的 API Key 格式可能不正確（預期以 \`${prefix}\` 開頭）。\n仍要儲存請重新執行指令並重新確認。`,
                ephemeral: true
            });
        }

        saveKey(userId, provider, apiKey);
        const action = sub === 'add' ? '新增' : '更新';
        return interaction.reply({
            content: `✅ 已${action}你的 ${providerName} API Key（**已加密儲存**）。\n翻譯時點擊「改使用 AI 翻譯」即可使用。\n\n⚠️ 提醒：建議不要在公開頻道使用此指令；對話結束後請手動刪除你輸入指令的訊息。`,
            ephemeral: true
        });
    }

    if (sub === 'del') {
        const provider = interaction.options.getString('provider');
        const providerName = PROVIDERS[provider]?.name || provider;
        const removed = removeKey(userId, provider);
        return interaction.reply({
            content: removed ? `✅ 已移除你的 ${providerName} API Key。` : `❌ 你尚未設定 ${providerName} API Key。`,
            ephemeral: true
        });
    }

    if (sub === 'status') {
        const status = getKeyStatus(userId);
        const lines = [
            '**🔑 你的 AI API Key 設定狀態**\n',
            `• OpenAI: ${status.openai ? '✅ 已設定（加密儲存）' : '❌ 未設定'}`,
            `• Claude: ${status.claude ? '✅ 已設定（加密儲存）' : '❌ 未設定'}`,
            `• Gemini: ${status.gemini ? '✅ 已設定（加密儲存）' : '❌ 未設定'}`,
            '',
            hasAnyKey(userId)
                ? '翻譯時可點擊「改使用 AI 翻譯」按鈕使用你的 Key。'
                : '使用 `/pe api add` 設定至少一組 Key 後，即可使用 AI 翻譯功能。'
        ];
        return interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }
}

// ────────────────────────────────────────────────────────────
// /pe log（per-guild）
// ────────────────────────────────────────────────────────────
async function handleLog(interaction, sub, guildId) {
    if (sub === 'show') {
        const g = db.guilds.get(guildId);
        const ch = g?.log_channel_id;
        return interaction.reply({
            content: ch ? `📋 目前日誌頻道：<#${ch}>` : '📋 本伺服器尚未設定日誌頻道（不會發 log）',
            ephemeral: true
        });
    }

    if (sub === 'add' || sub === 'edit') {
        const channel = interaction.options.getChannel('channel');
        db.guilds.setLogChannel(guildId, channel.id);
        const action = sub === 'add' ? '設定' : '更換';
        return interaction.reply({ content: `✅ 已${action}本伺服器日誌頻道為 <#${channel.id}>`, ephemeral: true });
    }

    if (sub === 'del') {
        const g = db.guilds.get(guildId);
        if (!g?.log_channel_id) {
            return interaction.reply({ content: '❌ 本伺服器尚未設定日誌頻道', ephemeral: true });
        }
        db.guilds.setLogChannel(guildId, null);
        return interaction.reply({ content: '✅ 已移除日誌頻道設定（停止發 log）', ephemeral: true });
    }
}

// ────────────────────────────────────────────────────────────
// /pe nouser（per-guild）
// ────────────────────────────────────────────────────────────
async function handleNoUser(interaction, guildId, addedBy) {
    const action = interaction.options.getString('action');

    if (action === 'list') {
        const list = db.excludedUsers.list(guildId);
        if (list.length === 0) return interaction.reply({ content: '📋 本伺服器目前沒有排除任何使用者', ephemeral: true });
        const lines = list.slice(0, 25).map(r => `• <@${r.user_id}>`);
        if (list.length > 25) lines.push(`...另有 ${list.length - 25} 位`);
        return interaction.reply({ content: `📋 本伺服器排除使用者（${list.length}）：\n${lines.join('\n')}`, ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    if (action === 'add') {
        if (db.excludedUsers.has(guildId, user.id)) {
            return interaction.reply({ content: `⚠️ ${user.tag} 已在排除清單中`, ephemeral: true });
        }
        db.excludedUsers.add(guildId, user.id, addedBy);
        return interaction.reply({ content: `✅ 已將 ${user.tag} 加入本伺服器排除清單`, ephemeral: true });
    }

    if (action === 'remove') {
        if (!db.excludedUsers.has(guildId, user.id)) {
            return interaction.reply({ content: `⚠️ ${user.tag} 不在本伺服器排除清單中`, ephemeral: true });
        }
        db.excludedUsers.remove(guildId, user.id);
        return interaction.reply({ content: `✅ 已將 ${user.tag} 從本伺服器排除清單移除`, ephemeral: true });
    }
}

// ────────────────────────────────────────────────────────────
// /pe noch（per-guild）
// ────────────────────────────────────────────────────────────
async function handleNoChannel(interaction, guildId, addedBy) {
    const action = interaction.options.getString('action');

    if (action === 'list') {
        const list = db.blockedChannels.list(guildId);
        if (list.length === 0) return interaction.reply({ content: '📋 本伺服器目前沒有排除任何頻道', ephemeral: true });
        const lines = list.slice(0, 25).map(r => `• <#${r.channel_id}>`);
        if (list.length > 25) lines.push(`...另有 ${list.length - 25} 個`);
        return interaction.reply({ content: `📋 本伺服器排除頻道（${list.length}）：\n${lines.join('\n')}`, ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    if (action === 'add') {
        if (db.blockedChannels.has(guildId, channel.id)) {
            return interaction.reply({ content: `⚠️ ${channel.name} 已在排除清單中`, ephemeral: true });
        }
        db.blockedChannels.add(guildId, channel.id, addedBy);
        return interaction.reply({ content: `✅ 已將 ${channel.name} 加入本伺服器排除清單`, ephemeral: true });
    }

    if (action === 'remove') {
        if (!db.blockedChannels.has(guildId, channel.id)) {
            return interaction.reply({ content: `⚠️ ${channel.name} 不在本伺服器排除清單中`, ephemeral: true });
        }
        db.blockedChannels.remove(guildId, channel.id);
        return interaction.reply({ content: `✅ 已將 ${channel.name} 從本伺服器排除清單移除`, ephemeral: true });
    }
}

// ────────────────────────────────────────────────────────────
// /pe owner（per-guild）
// ────────────────────────────────────────────────────────────
async function handleOwner(interaction, guildId) {
    const user = interaction.options.getUser('user');
    db.guilds.setOwner(guildId, user ? user.id : null);
    return interaction.reply({
        content: user
            ? `✅ 已設定本伺服器 Peko Embed 活動 owner 為 ${user.tag}（<@${user.id}>）`
            : '✅ 已清除本伺服器 Peko Embed 活動 owner 設定',
        ephemeral: true
    });
}

// ────────────────────────────────────────────────────────────
// /pe status（per-guild）
// ────────────────────────────────────────────────────────────
async function handleStatus(interaction, guildId) {
    const g = db.guilds.get(guildId) || {};
    const blocked = db.blockedChannels.list(guildId).length;
    const excluded = db.excludedUsers.list(guildId).length;

    const lines = [
        '**🔧 Peko Embed 本伺服器狀態**\n',
        `**啟用狀態：** ${g.enabled ? '✅ 啟用' : '❌ 停用'}`,
        `**日誌頻道：** ${g.log_channel_id ? `<#${g.log_channel_id}>` : '_未設定（不發 log）_'}`,
        `**活動 Owner：** ${g.owner_user_id ? `<@${g.owner_user_id}>` : '_未設定_'}`,
        `**排除使用者：** ${excluded} 位`,
        `**排除頻道：** ${blocked} 個`,
        '',
        '**🌐 翻譯系統：**',
        '• 一般內容：Google Translate / DeepL',
        '• Twitter 翻譯：用戶自備 Gemini Key（`/pe api add` 設定，加密儲存）'
    ];
    return interaction.reply({ content: lines.join('\n'), ephemeral: true });
}
