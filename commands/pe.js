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
 *   /pe linksup                   — 啟用/停用本伺服器支援網域（管理員）
 *   /pe status                    — 查看本伺服器 Peko Embed 狀態（管理員）
 *
 * 多租戶設計：
 *   - log_channel / blocked_channels / excluded_users / owner 全部 per-guild
 *   - api_keys 加密後儲存於 SQLite（per-user 全域，使用者設定一次即跨伺服器可用）
 */

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} = require('discord.js');

const db = require('../db');
const { PROVIDERS, saveKey, removeKey, getKeyStatus, hasAnyKey, getPreferredProvider, setPreferredProvider } = require('../utils/user-api-key-storage.js');
const tlog = require('../utils/tfd-logger');
const { getInstance: getGBM } = require('../utils/guild-blacklist-manager.js');
const linkSupport = require('../src/features/link-support/link-support-service');
const { listSupportedDomains } = require('../src/features/link-support/domain-registry');
const { sendPaginatedBlacklistList } = require('../src/features/moderation/blacklist-list-presenter');

const PROVIDER_CHOICES = [
    { name: 'OpenAI', value: 'openai' },
    { name: 'Claude (Anthropic)', value: 'claude' },
    { name: 'Gemini (Google)', value: 'gemini' },
    { name: 'OpenRouter', value: 'openrouter' }
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
            .addSubcommand(s => s.setName('model').setDescription('選擇預設翻譯引擎（點翻譯時使用）')
                .addStringOption(o => o.setName('provider').setDescription('要使用的 AI 服務商').setRequired(true).addChoices(...PROVIDER_CHOICES))
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


        // ── /pe blacklist（管理員，per-guild）──
        .addSubcommandGroup(g => g
            .setName('blacklist')
            .setDescription('管理本伺服器黑名單（管理員）')
            .addSubcommand(s => s.setName('add').setDescription('加入黑名單')
                .addStringOption(o => o.setName('platform').setDescription('平台').setRequired(true)
                    .addChoices(
                        { name: 'Twitter', value: 'twitter' },
                        { name: 'PTT', value: 'ptt' },
                        { name: 'Pixiv', value: 'pixiv' },
                        { name: 'YouTube', value: 'youtube' },
                        { name: 'Instagram', value: 'instagram' },
                        { name: 'Threads', value: 'threads' },
                        { name: '其他', value: 'other' }
                    ))
                .addStringOption(o => o.setName('author').setDescription('作者名稱').setRequired(true))
                .addIntegerOption(o => o.setName('level').setDescription('等級').setRequired(true)
                    .addChoices(
                        { name: '1 - 僅提示', value: 1 },
                        { name: '2 - 防爆雷', value: 2 },
                        { name: '3 - 封鎖', value: 3 }
                    ))
                .addStringOption(o => o.setName('label').setDescription('警告標記（等級 1 建議填寫）').setRequired(false))
            )
            .addSubcommand(s => s.setName('remove').setDescription('移除黑名單')
                .addStringOption(o => o.setName('platform').setDescription('平台').setRequired(true)
                    .addChoices(
                        { name: 'Twitter', value: 'twitter' },
                        { name: 'PTT', value: 'ptt' },
                        { name: 'Pixiv', value: 'pixiv' },
                        { name: 'YouTube', value: 'youtube' },
                        { name: 'Instagram', value: 'instagram' },
                        { name: 'Threads', value: 'threads' },
                        { name: '其他', value: 'other' }
                    ))
                .addStringOption(o => o.setName('author').setDescription('作者名稱').setRequired(true))
            )
            .addSubcommand(s => s.setName('switch').setDescription('啟用/停用黑名單系統')
                .addStringOption(o => o.setName('action').setDescription('on=啟用, off=停用').setRequired(true)
                    .addChoices({ name: 'ON - 啟用', value: 'on' }, { name: 'OFF - 停用', value: 'off' }))
            )
            .addSubcommand(s => s.setName('list').setDescription('列出本伺服器黑名單')
                .addStringOption(o => o.setName('platform').setDescription('過濾平台（可選）').setRequired(false)
                    .addChoices(
                        { name: 'Twitter', value: 'twitter' },
                        { name: 'PTT', value: 'ptt' },
                        { name: 'Pixiv', value: 'pixiv' },
                        { name: 'YouTube', value: 'youtube' },
                        { name: 'Instagram', value: 'instagram' },
                        { name: 'Threads', value: 'threads' },
                        { name: '其他', value: 'other' }
                    ))
            )
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

        // ── /pe linksup（管理員，per-guild）──
        .addSubcommand(s => s.setName('linksup').setDescription('啟用/停用本伺服器支援網域')
            .addStringOption(o => o.setName('action').setDescription('操作').setRequired(true)
                .addChoices(
                    { name: 'ON - 啟用支援網域', value: 'on' },
                    { name: 'OFF - 停用支援網域', value: 'off' },
                    { name: 'LIST - 查看停用網域', value: 'list' }
                ))
            .addStringOption(o => o.setName('domain').setDescription('支援網域，例如 x.com / twitter.com / pixiv.net').setRequired(false))
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
                return interaction.reply({ content: '❌ 此指令需要 `管理伺服器` 或 `管理員` 權限', flags: MessageFlags.Ephemeral });
            }

            if (!guildId) {
                return interaction.reply({ content: '❌ 此指令僅能在伺服器內使用', flags: MessageFlags.Ephemeral });
            }

            // 確保此 guild 已登錄
            db.guilds.upsert({
                guildId,
                guildName: interaction.guild?.name || null
            });

            if (group === 'log') return await handleLog(interaction, sub, guildId);
            if (group === 'blacklist') return await handleBlacklist(interaction, sub, guildId, userId);


            switch (sub) {
                case 'nouser': return await handleNoUser(interaction, guildId, userId);
                case 'noch': return await handleNoChannel(interaction, guildId, userId);
                case 'owner': return await handleOwner(interaction, guildId);
                case 'linksup': return await handleLinkSupport(interaction, guildId, userId);
                case 'status': return await handleStatus(interaction, guildId);
            }

        } catch (error) {
            tlog.error('/pe', interaction, `指令執行失敗: ${error.message}`);
            const reply = { content: '❌ 執行指令時發生錯誤，請稍後再試。', flags: MessageFlags.Ephemeral };
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
                flags: MessageFlags.Ephemeral
            });
        }

        saveKey(userId, provider, apiKey);
        const action = sub === 'add' ? '新增' : '更新';
        return interaction.reply({
            content: `✅ 已${action}你的 ${providerName} API Key（**已加密儲存**）。\n直接點擊「翻譯」即可使用。`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (sub === 'del') {
        const provider = interaction.options.getString('provider');
        const providerName = PROVIDERS[provider]?.name || provider;
        const removed = removeKey(userId, provider);
        return interaction.reply({
            content: removed ? `✅ 已移除你的 ${providerName} API Key。` : `❌ 你尚未設定 ${providerName} API Key。`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (sub === 'model') {
        const provider = interaction.options.getString('provider');
        const providerName = PROVIDERS[provider]?.name || provider;
        setPreferredProvider(userId, provider);
        return interaction.reply({
            content: `✅ 已將預設翻譯引擎設為 **${providerName}**。\n點擊「翻譯」按鈕時將優先使用此引擎。\n\n（尚未設定對應 API Key 的話，請使用 \`/pe api add provider:${providerName}\` 設定）`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (sub === 'status') {
        const status = getKeyStatus(userId);
        const preferred = getPreferredProvider(userId);
        const preferredName = preferred ? (PROVIDERS[preferred]?.name || preferred) : null;
        const lines = [
            '**🔑 你的 AI 翻譯設定狀態**\n',
            `• OpenAI: ${status.openai ? '✅ 已設定' : '❌ 未設定'}`,
            `• Claude: ${status.claude ? '✅ 已設定' : '❌ 未設定'}`,
            `• Gemini: ${status.gemini ? '✅ 已設定' : '❌ 未設定'}`,
            `• OpenRouter: ${status.openrouter ? '✅ 已設定' : '❌ 未設定'}`,
            '',
            `**預設翻譯引擎：** ${preferredName ? `✅ ${preferredName}` : '❌ 未選擇（請使用 `/pe api model` 選擇）'}`,
            '',
            hasAnyKey(userId)
                ? '設定好 Key 後，使用 `/pe api model` 選擇要用哪個引擎，再點擊「翻譯」即可使用。'
                : '請先使用 `/pe api add` 設定至少一組 Key，再用 `/pe api model` 選擇引擎。'
        ];
        return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
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
            flags: MessageFlags.Ephemeral
        });
    }

    if (sub === 'add' || sub === 'edit') {
        const channel = interaction.options.getChannel('channel');
        db.guilds.setLogChannel(guildId, channel.id);
        const action = sub === 'add' ? '設定' : '更換';
        return interaction.reply({ content: `✅ 已${action}本伺服器日誌頻道為 <#${channel.id}>`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'del') {
        const g = db.guilds.get(guildId);
        if (!g?.log_channel_id) {
            return interaction.reply({ content: '❌ 本伺服器尚未設定日誌頻道', flags: MessageFlags.Ephemeral });
        }
        db.guilds.setLogChannel(guildId, null);
        return interaction.reply({ content: '✅ 已移除日誌頻道設定（停止發 log）', flags: MessageFlags.Ephemeral });
    }
}

// ────────────────────────────────────────────────────────────
// /pe nouser（per-guild）
// ────────────────────────────────────────────────────────────
async function handleNoUser(interaction, guildId, addedBy) {
    const action = interaction.options.getString('action');

    if (action === 'list') {
        const list = db.excludedUsers.list(guildId);
        if (list.length === 0) return interaction.reply({ content: '📋 本伺服器目前沒有排除任何使用者', flags: MessageFlags.Ephemeral });
        const lines = list.slice(0, 25).map(r => `• <@${r.user_id}>`);
        if (list.length > 25) lines.push(`...另有 ${list.length - 25} 位`);
        return interaction.reply({ content: `📋 本伺服器排除使用者（${list.length}）：\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
    }

    const user = interaction.options.getUser('user');
    if (action === 'add') {
        if (db.excludedUsers.has(guildId, user.id)) {
            return interaction.reply({ content: `⚠️ ${user.tag} 已在排除清單中`, flags: MessageFlags.Ephemeral });
        }
        db.excludedUsers.add(guildId, user.id, addedBy);
        return interaction.reply({ content: `✅ 已將 ${user.tag} 加入本伺服器排除清單`, flags: MessageFlags.Ephemeral });
    }

    if (action === 'remove') {
        if (!db.excludedUsers.has(guildId, user.id)) {
            return interaction.reply({ content: `⚠️ ${user.tag} 不在本伺服器排除清單中`, flags: MessageFlags.Ephemeral });
        }
        db.excludedUsers.remove(guildId, user.id);
        return interaction.reply({ content: `✅ 已將 ${user.tag} 從本伺服器排除清單移除`, flags: MessageFlags.Ephemeral });
    }
}

// ────────────────────────────────────────────────────────────
// /pe noch（per-guild）
// ────────────────────────────────────────────────────────────
async function handleNoChannel(interaction, guildId, addedBy) {
    const action = interaction.options.getString('action');

    if (action === 'list') {
        const list = db.blockedChannels.list(guildId);
        if (list.length === 0) return interaction.reply({ content: '📋 本伺服器目前沒有排除任何頻道', flags: MessageFlags.Ephemeral });
        const lines = list.slice(0, 25).map(r => `• <#${r.channel_id}>`);
        if (list.length > 25) lines.push(`...另有 ${list.length - 25} 個`);
        return interaction.reply({ content: `📋 本伺服器排除頻道（${list.length}）：\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
    }

    const channel = interaction.options.getChannel('channel');
    if (action === 'add') {
        if (db.blockedChannels.has(guildId, channel.id)) {
            return interaction.reply({ content: `⚠️ ${channel.name} 已在排除清單中`, flags: MessageFlags.Ephemeral });
        }
        db.blockedChannels.add(guildId, channel.id, addedBy);
        return interaction.reply({ content: `✅ 已將 ${channel.name} 加入本伺服器排除清單`, flags: MessageFlags.Ephemeral });
    }

    if (action === 'remove') {
        if (!db.blockedChannels.has(guildId, channel.id)) {
            return interaction.reply({ content: `⚠️ ${channel.name} 不在本伺服器排除清單中`, flags: MessageFlags.Ephemeral });
        }
        db.blockedChannels.remove(guildId, channel.id);
        return interaction.reply({ content: `✅ 已將 ${channel.name} 從本伺服器排除清單移除`, flags: MessageFlags.Ephemeral });
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
        flags: MessageFlags.Ephemeral
    });
}

// ────────────────────────────────────────────────────────────
// /pe linksup（per-guild）
// ────────────────────────────────────────────────────────────
async function handleLinkSupport(interaction, guildId, userId) {
    const action = interaction.options.getString('action');
    const domain = interaction.options.getString('domain');

    if (action === 'list') {
        const disabled = linkSupport.listDisabledDomains(guildId);
        if (disabled.length === 0) {
            return interaction.reply({
                content: `📋 本伺服器目前沒有停用任何支援網域。\n可用範例：\`/pe linksup action:off domain:x.com\``,
                flags: MessageFlags.Ephemeral
            });
        }

        const lines = disabled.slice(0, 20).map(row => `• ${row.domain}（${row.site_name}）`);
        if (disabled.length > 20) lines.push(`...另有 ${disabled.length - 20} 個`);
        return interaction.reply({
            content: `📋 本伺服器已停用支援網域（${disabled.length}）：\n${lines.join('\n')}`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (!domain?.trim()) {
        return interaction.reply({
            content: `❌ 請提供要設定的支援網域。\n可用範例：\`/pe linksup action:${action} domain:x.com\`\n${formatSupportedDomainHint()}`,
            flags: MessageFlags.Ephemeral
        });
    }

    const enabled = action === 'on';
    const result = linkSupport.setDomainEnabled(guildId, domain, enabled, userId);
    if (!result.ok) {
        return interaction.reply({
            content: `❌ 不支援或無法辨識的網域：\`${domain}\`\n${formatSupportedDomainHint()}`,
            flags: MessageFlags.Ephemeral
        });
    }

    return interaction.reply({
        content: enabled
            ? `✅ 已啟用本伺服器支援網域：\`${result.domain}\`（${result.label}）`
            : `✅ 已停用本伺服器支援網域：\`${result.domain}\`（${result.label}）`,
        flags: MessageFlags.Ephemeral
    });
}

function formatSupportedDomainHint(limit = 14) {
    const domains = listSupportedDomains().slice(0, limit).map(entry => entry.domain);
    return `支援網域範例：${domains.map(domain => `\`${domain}\``).join('、')} 等。`;
}

// ────────────────────────────────────────────────────────────
// /pe status（per-guild）
// ────────────────────────────────────────────────────────────
async function handleStatus(interaction, guildId) {
    const g = db.guilds.get(guildId) || {};
    const blocked = db.blockedChannels.list(guildId).length;
    const excluded = db.excludedUsers.list(guildId).length;
    const disabledDomains = db.linkDomains.listDisabled(guildId).length;

    const lines = [
        '**🔧 Peko Embed 本伺服器狀態**\n',
        `**啟用狀態：** ${g.enabled ? '✅ 啟用' : '❌ 停用'}`,
        `**日誌頻道：** ${g.log_channel_id ? `<#${g.log_channel_id}>` : '_未設定（不發 log）_'}`,
        `**活動 Owner：** ${g.owner_user_id ? `<@${g.owner_user_id}>` : '_未設定_'}`,
        `**排除使用者：** ${excluded} 位`,
        `**排除頻道：** ${blocked} 個`,
        `**停用支援網域：** ${disabledDomains} 個`,
        '',
        '**🌐 連結支援：**',
        '• 網域開關：`/pe linksup action:list`',
        '• 翻譯 API：使用者自備 Key，透過 `/pe api add` 與 `/pe api model` 設定'
    ];
    return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}


// ────────────────────────────────────────────────────────────
// /pe blacklist（per-guild）
// ────────────────────────────────────────────────────────────
async function handleBlacklist(interaction, sub, guildId, userId) {
    const gbm = getGBM();

    if (sub === 'switch') return handleBlacklistSwitch(interaction, guildId);
    if (sub === 'add') {
        const platform = interaction.options.getString('platform');
        const author = interaction.options.getString('author').trim();
        const level = interaction.options.getInteger('level');
        const label = interaction.options.getString('label');

        if (!author) {
            return interaction.reply({ content: '❌ 作者名稱不可為空', flags: MessageFlags.Ephemeral });
        }

        gbm.add(guildId, platform, author, {
            level,
            label,
            addedBy: userId
        });

        const levelNames = { 1: '僅提示', 2: '防爆雷', 3: '封鎖' };
        return interaction.reply({
            content: `✅ 已將 ${platform} 作者 ${author} 加入黑名單（等級 ${level}: ${levelNames[level] || level}）`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (sub === 'remove') {
        const platform = interaction.options.getString('platform');
        const author = interaction.options.getString('author').trim();
        const removed = gbm.remove(guildId, platform, author);

        return interaction.reply({
            content: removed > 0
                ? `✅ 已從黑名單移除 ${platform} 作者 ${author}`
                : `❌ 找不到 ${platform} 作者 ${author} 的黑名單記錄`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (sub === 'list') {
        const platform = interaction.options.getString('platform');
        const list = gbm.list(guildId, platform || null);

        if (list.length === 0) {
            return interaction.reply({
                content: '📋 本伺服器目前沒有黑名單記錄',
                flags: MessageFlags.Ephemeral
            });
        }

        return sendPaginatedBlacklistList(interaction, list, { platform });
    }
}

async function handleBlacklistSwitch(interaction, guildId) {
    const action = interaction.options.getString('action');
    const enabled = action === 'on';
    db.guilds.setBlacklistEnabled(guildId, enabled);
    return interaction.reply({
        content: enabled ? '✅ 已啟用本伺服器黑名單系統' : '✅ 已停用本伺服器黑名單系統',
        flags: MessageFlags.Ephemeral
    });
}
