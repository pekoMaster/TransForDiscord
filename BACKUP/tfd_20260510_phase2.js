/**
 * TFD 系統管理指令
 * 子指令群：
 *   /tfd api add|edit|del|status  — 管理個人 AI API Key（所有用戶）
 *   /tfd log add|edit|del         — 管理日誌頻道（管理員）
 *   /tfd nouser                   — 排除用戶（管理員）
 *   /tfd noch                     — 排除頻道（管理員）
 *   /tfd status                   — 系統狀態（管理員）
 */

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../tfd-system/config/tfd-config.json');
const { PROVIDERS, saveKey, removeKey, getKeyStatus, hasAnyKey } = require('../utils/user-api-key-storage.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tfd')
        .setDescription('TFD 連結預覽系統管理')
        // ── /tfd api ──
        .addSubcommandGroup(group => group
            .setName('api')
            .setDescription('管理你的個人 AI 翻譯 API Key')
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('新增 AI API Key')
                .addStringOption(opt => opt
                    .setName('provider')
                    .setDescription('AI 服務商')
                    .setRequired(true)
                    .addChoices(
                        { name: 'OpenAI', value: 'openai' },
                        { name: 'Claude (Anthropic)', value: 'claude' },
                        { name: 'Gemini (Google)', value: 'gemini' }
                    )
                )
                .addStringOption(opt => opt
                    .setName('apikey')
                    .setDescription('你的 API Key')
                    .setRequired(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('edit')
                .setDescription('修改已設定的 API Key')
                .addStringOption(opt => opt
                    .setName('provider')
                    .setDescription('AI 服務商')
                    .setRequired(true)
                    .addChoices(
                        { name: 'OpenAI', value: 'openai' },
                        { name: 'Claude (Anthropic)', value: 'claude' },
                        { name: 'Gemini (Google)', value: 'gemini' }
                    )
                )
                .addStringOption(opt => opt
                    .setName('apikey')
                    .setDescription('新的 API Key')
                    .setRequired(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('del')
                .setDescription('刪除已設定的 API Key')
                .addStringOption(opt => opt
                    .setName('provider')
                    .setDescription('AI 服務商')
                    .setRequired(true)
                    .addChoices(
                        { name: 'OpenAI', value: 'openai' },
                        { name: 'Claude (Anthropic)', value: 'claude' },
                        { name: 'Gemini (Google)', value: 'gemini' }
                    )
                )
            )
            .addSubcommand(sub => sub
                .setName('status')
                .setDescription('查看你的 API Key 設定狀態')
            )
        )
        // ── /tfd log ──
        .addSubcommandGroup(group => group
            .setName('log')
            .setDescription('管理日誌頻道（管理員）')
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('設定日誌頻道')
                .addChannelOption(opt => opt
                    .setName('channel')
                    .setDescription('日誌頻道')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
                )
            )
            .addSubcommand(sub => sub
                .setName('edit')
                .setDescription('更換日誌頻道')
                .addChannelOption(opt => opt
                    .setName('channel')
                    .setDescription('新的日誌頻道')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
                )
            )
            .addSubcommand(sub => sub
                .setName('del')
                .setDescription('移除日誌頻道設定')
            )
        )
        // ── /tfd nouser ──
        .addSubcommand(sub => sub
            .setName('nouser')
            .setDescription('設定不觸發 TFD 的用戶（管理員）')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('要排除的用戶')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('操作類型')
                .setRequired(true)
                .addChoices(
                    { name: '新增排除', value: 'add' },
                    { name: '移除排除', value: 'remove' }
                )
            )
        )
        // ── /tfd noch ──
        .addSubcommand(sub => sub
            .setName('noch')
            .setDescription('設定不觸發 TFD 的頻道（管理員）')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('要排除的頻道')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('操作類型')
                .setRequired(true)
                .addChoices(
                    { name: '新增排除', value: 'add' },
                    { name: '移除排除', value: 'remove' }
                )
            )
        )
        // ── /tfd status ──
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('查看 TFD 系統狀態和設定（管理員）')
        ),

    async execute(interaction) {
        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        try {
            // ── API Key 管理（所有用戶可用）──
            if (group === 'api') {
                return await this.handleApi(interaction, sub, userId);
            }

            // ── 以下需要管理員權限 ──
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
                !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: '❌ 此指令需要管理員權限',
                    ephemeral: true
                });
            }

            if (group === 'log') {
                return await this.handleLog(interaction, sub);
            }

            // 載入配置
            const config = this.loadConfig();

            switch (sub) {
                case 'nouser':
                    return await this.handleNoUser(interaction, config);
                case 'noch':
                    return await this.handleNoChannel(interaction, config);
                case 'status':
                    return await this.handleStatus(interaction, config);
            }

        } catch (error) {
            console.error('TFD 指令執行失敗:', error);
            const reply = { content: '❌ 執行指令時發生錯誤', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    },

    // ── API Key 管理 ──
    async handleApi(interaction, sub, userId) {
        if (sub === 'add' || sub === 'edit') {
            const provider = interaction.options.getString('provider');
            const apiKey = interaction.options.getString('apikey');
            const providerName = PROVIDERS[provider]?.name || provider;

            // 基本格式驗證
            const prefix = PROVIDERS[provider]?.prefix;
            if (prefix && !apiKey.startsWith(prefix)) {
                return interaction.reply({
                    content: `⚠️ ${providerName} 的 API Key 格式可能不正確（預期以 \`${prefix}\` 開頭）。\n仍要儲存嗎？請確認後重新執行指令。`,
                    ephemeral: true
                });
            }

            saveKey(userId, provider, apiKey);
            const action = sub === 'add' ? '新增' : '更新';

            return interaction.reply({
                content: `✅ 已${action}你的 ${providerName} API Key。\n翻譯時點擊「改使用 AI 翻譯」按鈕即可使用。\n\n⚠️ 提醒：此訊息中不會顯示你的 Key，但建議不要在公開頻道使用此指令。`,
                ephemeral: true
            });
        }

        if (sub === 'del') {
            const provider = interaction.options.getString('provider');
            const providerName = PROVIDERS[provider]?.name || provider;
            const removed = removeKey(userId, provider);

            return interaction.reply({
                content: removed
                    ? `✅ 已移除你的 ${providerName} API Key。`
                    : `❌ 你尚未設定 ${providerName} API Key，無需移除。`,
                ephemeral: true
            });
        }

        if (sub === 'status') {
            const status = getKeyStatus(userId);
            const lines = [
                `**🔑 你的 AI API Key 設定狀態**\n`,
                `• OpenAI: ${status.openai ? '✅ 已設定' : '❌ 未設定'}`,
                `• Claude: ${status.claude ? '✅ 已設定' : '❌ 未設定'}`,
                `• Gemini: ${status.gemini ? '✅ 已設定' : '❌ 未設定'}`,
                '',
                hasAnyKey(userId)
                    ? '翻譯時可點擊「改使用 AI 翻譯」按鈕使用你的 Key。'
                    : '使用 `/tfd api add` 設定至少一組 Key 後，即可使用 AI 翻譯功能。'
            ];

            return interaction.reply({
                content: lines.join('\n'),
                ephemeral: true
            });
        }
    },

    // ── 日誌頻道管理 ──
    async handleLog(interaction, sub) {
        const config = this.loadConfig();
        if (!config.settings) config.settings = {};

        // 取得伺服器特定設定
        const guildId = interaction.guildId;
        if (!config.guildSettings) config.guildSettings = {};
        if (!config.guildSettings[guildId]) config.guildSettings[guildId] = {};

        if (sub === 'add' || sub === 'edit') {
            const channel = interaction.options.getChannel('channel');
            config.guildSettings[guildId].logChannelId = channel.id;
            this.saveConfig(config);

            const action = sub === 'add' ? '設定' : '更換';
            return interaction.reply({
                content: `✅ 已${action}日誌頻道為 <#${channel.id}>`,
                ephemeral: true
            });
        }

        if (sub === 'del') {
            if (!config.guildSettings[guildId]?.logChannelId) {
                return interaction.reply({
                    content: '❌ 此伺服器尚未設定日誌頻道',
                    ephemeral: true
                });
            }

            delete config.guildSettings[guildId].logChannelId;
            this.saveConfig(config);
            return interaction.reply({
                content: '✅ 已移除日誌頻道設定',
                ephemeral: true
            });
        }
    },

    // ── 排除用戶 ──
    async handleNoUser(interaction, config) {
        const user = interaction.options.getUser('user');
        const action = interaction.options.getString('action');

        if (!config.settings.excludedUsers) config.settings.excludedUsers = [];

        if (action === 'add') {
            if (config.settings.excludedUsers.includes(user.id)) {
                return interaction.reply({ content: `⚠️ ${user.tag} 已在排除清單中`, ephemeral: true });
            }
            config.settings.excludedUsers.push(user.id);
            this.saveConfig(config);
            return interaction.reply({ content: `✅ 已將 ${user.tag} 加入 TFD 排除清單`, ephemeral: true });
        } else {
            const idx = config.settings.excludedUsers.indexOf(user.id);
            if (idx === -1) {
                return interaction.reply({ content: `⚠️ ${user.tag} 不在排除清單中`, ephemeral: true });
            }
            config.settings.excludedUsers.splice(idx, 1);
            this.saveConfig(config);
            return interaction.reply({ content: `✅ 已將 ${user.tag} 從 TFD 排除清單移除`, ephemeral: true });
        }
    },

    // ── 排除頻道 ──
    async handleNoChannel(interaction, config) {
        const channel = interaction.options.getChannel('channel');
        const action = interaction.options.getString('action');

        if (!config.settings.blockedChannels) config.settings.blockedChannels = [];

        if (action === 'add') {
            if (config.settings.blockedChannels.includes(channel.id)) {
                return interaction.reply({ content: `⚠️ ${channel.name} 已在排除清單中`, ephemeral: true });
            }
            config.settings.blockedChannels.push(channel.id);
            this.saveConfig(config);
            return interaction.reply({ content: `✅ 已將 ${channel.name} 加入 TFD 排除清單`, ephemeral: true });
        } else {
            const idx = config.settings.blockedChannels.indexOf(channel.id);
            if (idx === -1) {
                return interaction.reply({ content: `⚠️ ${channel.name} 不在排除清單中`, ephemeral: true });
            }
            config.settings.blockedChannels.splice(idx, 1);
            this.saveConfig(config);
            return interaction.reply({ content: `✅ 已將 ${channel.name} 從 TFD 排除清單移除`, ephemeral: true });
        }
    },

    // ── 系統狀態 ──
    async handleStatus(interaction, config) {
        const guildId = interaction.guildId;
        const guildConfig = config.guildSettings?.[guildId] || {};
        const excludedUserCount = config.settings?.excludedUsers?.length || 0;
        const blockedChannelCount = config.settings?.blockedChannels?.length || 0;

        let statusText = `**🔧 TFD 系統狀態**\n\n`;
        statusText += `**系統狀態:** ${config.enabled !== false ? '✅ 啟用' : '❌ 停用'}\n`;
        statusText += `**版本:** ${config.version || '2.0.0'}\n\n`;

        // 日誌頻道
        statusText += `**📋 伺服器設定:**\n`;
        statusText += `• 日誌頻道: ${guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : '未設定'}\n`;

        statusText += `\n**🚫 排除設定:**\n`;
        statusText += `• 排除用戶: ${excludedUserCount} 個\n`;
        statusText += `• 排除頻道: ${blockedChannelCount} 個\n`;

        statusText += `\n**🌐 翻譯系統:**\n`;
        statusText += `• 預設引擎: DeepL\n`;
        statusText += `• AI 翻譯: 用戶自備 Key (OpenAI/Claude/Gemini)\n`;

        return interaction.reply({ content: statusText, ephemeral: true });
    },

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            }
        } catch {}
        return { version: '2.0.0', enabled: true, settings: {} };
    },

    saveConfig(config) {
        try {
            const dir = path.dirname(CONFIG_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
            console.log('[TFD] 配置已儲存');
        } catch (error) {
            console.error('[TFD] 儲存配置失敗:', error);
        }
    }
};
