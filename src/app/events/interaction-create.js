/**
 * TransForDiscord — 互動路由
 * 處理 TFD 相關的按鈕與斜線指令
 */

const path = require('path');
const fs = require('fs');
const { MessageFlags } = require('discord.js');
const tlog = require('../../shared/logging/tfd-logger');

// 斜線指令快取
const commands = new Map();

// 載入 commands/ 目錄下的指令
const commandsPath = path.join(__dirname, '../../../commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const cmd = require(path.join(commandsPath, file));
            if (cmd.data && cmd.execute) {
                commands.set(cmd.data.name, cmd);
            }
        } catch (e) {
            tlog.sysError('InteractionCreate', `載入指令 ${file} 失敗: ${e.message}`);
        }
    }
}

const processedInteractions = new Set();

async function execute(interaction, client) {
    const id = interaction.id;
    if (processedInteractions.has(id)) return;
    processedInteractions.add(id);
    if (processedInteractions.size > 500) {
        const first = processedInteractions.values().next().value;
        processedInteractions.delete(first);
    }

    try {
        // ── 斜線指令 ──
        if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
            const cmd = commands.get(interaction.commandName);
            if (!cmd) return;
            await cmd.execute(interaction, client);
            return;
        }

        // ── Modal 提交 ──
        if (interaction.isModalSubmit()) {
            const modalId = interaction.customId;

            // V2 防爆雷 Modal
            if (modalId.startsWith('v2_spoiler_modal_')) {
                const { handleV2SpoilerModalSubmit } = require('../../features/twitter/interactions/v2-router.js');
                return await handleV2SpoilerModalSubmit(interaction);
            }


            // Context menu modals
            if (modalId.startsWith('ctx_delete_modal_') || modalId.startsWith('ctx_spoiler_modal_') || modalId.startsWith('ctx_report_modal_')) {
                const ctxCmd = commands.get('PekoEmbed 操作');
                if (ctxCmd && ctxCmd.handleContextModal) return await ctxCmd.handleContextModal(interaction);
            }

            // Report system modals
            if (modalId.startsWith('report_spoiler_modal_') ||
                modalId.startsWith('report_recall_modal_') ||
                modalId.startsWith('report_blacklist_modal_') ||
                modalId.startsWith('rbl_admin_modal_')) {
                const { routeReportInteraction } = require('../../features/reports/interactions/report-router.js');
                return await routeReportInteraction(interaction);
            }

            // 通用防爆雷 Modal
            if (modalId.startsWith('spoiler_modal_')) {
                const { handleSpoilerModalSubmit } = require('../../../handlers/spoiler-button-interactions.js');
                return await handleSpoilerModalSubmit(interaction);
            }

            return;
        }

        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        const customId = interaction.customId;

        // ── 通用防爆雷按鈕 ──
        if (customId === 'spoiler_btn') {
            const { handleSpoilerButtonInteraction } = require('../../../handlers/spoiler-button-interactions.js');
            return await handleSpoilerButtonInteraction(interaction);
        }


        // ── Context menu actions (PekoEmbed 操作)
        if (customId.startsWith('ctx_')) {
            const ctxCmd = commands.get('PekoEmbed 操作');
            if (ctxCmd && ctxCmd.handleContextButton) return await ctxCmd.handleContextButton(interaction);
        }

        // ── Report system (回報 / 防爆雷 / 收回 / 黑名單回報 / 管理員審核) ──
        if (customId.startsWith('report_') || customId.startsWith('rbl_')) {
            const { routeReportInteraction } = require('../../features/reports/interactions/report-router.js');
            return await routeReportInteraction(interaction);
        }

        // ── Twitter V2 互動
        if (customId.startsWith('v2_')) {
            const handler = require('../../features/twitter/interactions/v2-router.js');
            return await handler.handleV2Interaction(interaction);
        }

        // ── Twitter 全展開/全收回（必須在 twitter_expand_ 之前匹配）──
        if (customId.startsWith('twitter_expand_all_') || customId.startsWith('twitter_collapse_all_')) {
            const { handleTwitterAllToggleInteraction } = require('../../features/twitter/interactions/toggle-all.js');
            return await handleTwitterAllToggleInteraction(interaction);
        }

        // ── Twitter 展開/收起（單文字）──
        if (customId.startsWith('twitter_expand_') || customId.startsWith('twitter_collapse_')) {
            const { handleTwitterExpandInteraction } = require('../../features/twitter/interactions/expand.js');
            return await handleTwitterExpandInteraction(interaction);
        }

        // ── Twitter 翻譯 ──
        if (customId.startsWith('twitter_translate_') ||
            customId.startsWith('twitter_original_')) {
            const { handleTranslateInteraction } = require('../../features/twitter/interactions/translation.js');
            return await handleTranslateInteraction(interaction);
        }

        // ── Twitter 重新整理 ──
        if (customId.startsWith('twitter_reload_')) {
            const handler = require('../../features/twitter/interactions/reload.js');
            return await handler.handleTwitterReloadInteraction(interaction);
        }

        // ── Twitter 分頁 ──
        if (customId.startsWith('twitter_page_')) {
            const { handlePagination } = require('../../features/twitter/interactions/media-pagination.js');
            return await handlePagination(interaction);
        }

        // ── Pixiv 重新整理（必須在 pixiv_ 之前匹配）──
        if (customId.startsWith('pixiv_reload_')) {
            const { handlePixivReloadInteraction } = require('../../features/pixiv/interactions/reload.js');
            return await handlePixivReloadInteraction(interaction);
        }

        // ── Pixiv 分頁 ──
        if (customId.startsWith('pixiv_')) {
            const handler = require('../../features/pixiv/interactions/pagination.js');
            return await handler.execute(interaction);
        }

        // ── PTT 分頁 ──
        if (customId.startsWith('ptt_')) {
            const handler = require('../../features/ptt/interactions/pagination.js');
            return await handler.execute(interaction);
        }

    } catch (err) {
        tlog.error('InteractionCreate', interaction, `處理錯誤 (${interaction.customId || interaction.commandName}): ${err.message}`);
        try {
            const msg = { content: '❌ 處理請求時發生錯誤，請稍後再試。', flags: MessageFlags.Ephemeral };
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(msg);
            }
        } catch (_) {}
    }
}

module.exports = { execute };
