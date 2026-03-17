/**
 * Ermiana 系統管理指令
 * 管理用戶排除、頻道排除和防爆雷設定
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 配置檔案路徑
const CONFIG_PATH = path.join(__dirname, '../../ermiana-system/config/ermiana-config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ermiana')
        .setDescription('Ermiana 連結預覽系統管理')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(subcommand =>
            subcommand
                .setName('nouser')
                .setDescription('設定不觸發 Ermiana 的用戶')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('要排除的用戶')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('操作類型')
                        .setRequired(true)
                        .addChoices(
                            { name: '新增排除', value: 'add' },
                            { name: '移除排除', value: 'remove' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('noch')
                .setDescription('設定不觸發 Ermiana 的頻道')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('要排除的頻道')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('操作類型')
                        .setRequired(true)
                        .addChoices(
                            { name: '新增排除', value: 'add' },
                            { name: '移除排除', value: 'remove' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('查看 Ermiana 系統狀態和設定')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            // 載入當前配置
            let config = {};
            if (fs.existsSync(CONFIG_PATH)) {
                const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
                config = JSON.parse(configData);
            }

            // 確保配置結構完整
            if (!config.settings) config.settings = {};
            if (!config.settings.excludedUsers) config.settings.excludedUsers = [];
            if (!config.settings.blockedChannels) config.settings.blockedChannels = [];

            switch (subcommand) {
                case 'nouser': {
                    const user = interaction.options.getUser('user');
                    const action = interaction.options.getString('action');

                    if (action === 'add') {
                        if (!config.settings.excludedUsers.includes(user.id)) {
                            config.settings.excludedUsers.push(user.id);
                            this.saveConfig(config);
                            await interaction.reply({
                                content: `✅ 已將 ${user.tag} 加入 Ermiana 排除清單`,
                                ephemeral: true
                            });
                        } else {
                            await interaction.reply({
                                content: `⚠️ ${user.tag} 已在排除清單中`,
                                ephemeral: true
                            });
                        }
                    } else if (action === 'remove') {
                        const index = config.settings.excludedUsers.indexOf(user.id);
                        if (index > -1) {
                            config.settings.excludedUsers.splice(index, 1);
                            this.saveConfig(config);
                            await interaction.reply({
                                content: `✅ 已將 ${user.tag} 從 Ermiana 排除清單移除`,
                                ephemeral: true
                            });
                        } else {
                            await interaction.reply({
                                content: `⚠️ ${user.tag} 不在排除清單中`,
                                ephemeral: true
                            });
                        }
                    }
                    break;
                }

                case 'noch': {
                    const channel = interaction.options.getChannel('channel');
                    const action = interaction.options.getString('action');

                    if (action === 'add') {
                        if (!config.settings.blockedChannels.includes(channel.id)) {
                            config.settings.blockedChannels.push(channel.id);
                            this.saveConfig(config);
                            await interaction.reply({
                                content: `✅ 已將 ${channel.name} 加入 Ermiana 排除清單`,
                                ephemeral: true
                            });
                        } else {
                            await interaction.reply({
                                content: `⚠️ ${channel.name} 已在排除清單中`,
                                ephemeral: true
                            });
                        }
                    } else if (action === 'remove') {
                        const index = config.settings.blockedChannels.indexOf(channel.id);
                        if (index > -1) {
                            config.settings.blockedChannels.splice(index, 1);
                            this.saveConfig(config);
                            await interaction.reply({
                                content: `✅ 已將 ${channel.name} 從 Ermiana 排除清單移除`,
                                ephemeral: true
                            });
                        } else {
                            await interaction.reply({
                                content: `⚠️ ${channel.name} 不在排除清單中`,
                                ephemeral: true
                            });
                        }
                    }
                    break;
                }

                case 'status': {
                    const excludedUserCount = config.settings.excludedUsers?.length || 0;
                    const blockedChannelCount = config.settings.blockedChannels?.length || 0;

                    // 獲取用戶和頻道名稱
                    let excludedUserNames = [];
                    if (config.settings.excludedUsers?.length > 0) {
                        for (const userId of config.settings.excludedUsers.slice(0, 10)) {
                            try {
                                const user = await interaction.client.users.fetch(userId);
                                excludedUserNames.push(user.tag);
                            } catch {
                                excludedUserNames.push(`<${userId}>`);
                            }
                        }
                    }

                    let blockedChannelNames = [];
                    if (config.settings.blockedChannels?.length > 0) {
                        for (const channelId of config.settings.blockedChannels.slice(0, 10)) {
                            try {
                                const channel = await interaction.guild.channels.fetch(channelId);
                                blockedChannelNames.push(channel.name);
                            } catch {
                                blockedChannelNames.push(`<${channelId}>`);
                            }
                        }
                    }

                    let statusText = `**🔧 Ermiana 系統狀態**\n\n`;
                    statusText += `**系統狀態:** ${config.enabled ? '✅ 啟用' : '❌ 停用'}\n`;
                    statusText += `**版本:** ${config.version || '1.0.0'}\n\n`;

                    statusText += `**📋 排除設定:**\n`;
                    statusText += `• 排除用戶: ${excludedUserCount} 個\n`;
                    if (excludedUserNames.length > 0) {
                        statusText += `  ${excludedUserNames.join(', ')}${excludedUserCount > 10 ? '...' : ''}\n`;
                    }

                    statusText += `• 排除頻道: ${blockedChannelCount} 個\n`;
                    if (blockedChannelNames.length > 0) {
                        statusText += `  ${blockedChannelNames.join(', ')}${blockedChannelCount > 10 ? '...' : ''}\n`;
                    }

                    await interaction.reply({
                        content: statusText,
                        ephemeral: true
                    });
                    break;
                }
            }

        } catch (error) {
            console.error('Ermiana 指令執行失敗:', error);
            await interaction.reply({
                content: '❌ 執行指令時發生錯誤',
                ephemeral: true
            });
        }
    },

    /**
     * 儲存配置到檔案
     */
    saveConfig(config) {
        try {
            // 確保目錄存在
            const configDir = path.dirname(CONFIG_PATH);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
            console.log('[Ermiana] 配置已儲存');
        } catch (error) {
            console.error('[Ermiana] 儲存配置失敗:', error);
        }
    }
};