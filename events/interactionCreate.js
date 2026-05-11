/**
 * TransForDiscord — 互動路由
 * 處理 TFD 相關的按鈕與斜線指令
 */

const path = require('path');
const fs = require('fs');
const { MessageFlags } = require('discord.js');

// 斜線指令快取
const commands = new Map();

// 載入 commands/ 目錄下的指令
const commandsPath = path.join(__dirname, '../commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const cmd = require(path.join(commandsPath, file));
            if (cmd.data && cmd.execute) {
                commands.set(cmd.data.name, cmd);
            }
        } catch (e) {
            console.error(`載入指令 ${file} 失敗:`, e.message);
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
        if (interaction.isChatInputCommand()) {
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
                const { handleV2SpoilerModalSubmit } = require('../handlers/twitter-v2-interactions.js');
                return await handleV2SpoilerModalSubmit(interaction);
            }

            // 通用防爆雷 Modal
            if (modalId.startsWith('spoiler_modal_')) {
                const { handleSpoilerModalSubmit } = require('../handlers/spoiler-button-interactions.js');
                return await handleSpoilerModalSubmit(interaction);
            }

            return;
        }

        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        const customId = interaction.customId;

        // ── 通用防爆雷按鈕 ──
        if (customId === 'spoiler_btn') {
            const { handleSpoilerButtonInteraction } = require('../handlers/spoiler-button-interactions.js');
            return await handleSpoilerButtonInteraction(interaction);
        }

        // ── Twitter V2 互動（翻譯、引用、回覆、全文展開、防爆雷）──
        if (customId.startsWith('v2_')) {
            const handler = require('../handlers/twitter-v2-interactions.js');
            return await handler.handleV2Interaction(interaction);
        }

        // ── Twitter 展開/收起 ──
        if (customId.startsWith('twitter_expand_') || customId.startsWith('twitter_collapse_')) {
            const handler = require('../handlers/twitter-expand-interactions.js');
            return await handler.execute(interaction);
        }

        // ── Twitter 翻譯 ──
        if (customId.startsWith('twitter_translate_') ||
            customId.startsWith('twitter_original_')) {
            const handler = require('../handlers/twitter-translate-interactions.js');
            return await handler.execute(interaction);
        }

        // ── Twitter 重新整理 ──
        if (customId.startsWith('twitter_reload_')) {
            const handler = require('../handlers/twitter-reload-interactions.js');
            return await handler.handleTwitterReloadInteraction(interaction);
        }

        // ── Twitter 分頁 ──
        if (customId.startsWith('twitter_page_')) {
            const handler = require('../handlers/twitter-pagination-interactions.js');
            return await handler.execute(interaction);
        }

        // ── Pixiv 分頁 ──
        if (customId.startsWith('pixiv_')) {
            const handler = require('./pixiv-pagination-interactions.js');
            return await handler.execute(interaction);
        }

        // ── PTT 分頁 ──
        if (customId.startsWith('ptt_')) {
            const handler = require('./ptt-pagination-interactions.js');
            return await handler.execute(interaction);
        }

    } catch (err) {
        console.error(`[InteractionCreate] 處理錯誤 (${interaction.customId || interaction.commandName}):`, err.message);
        try {
            const msg = { content: '❌ 處理請求時發生錯誤，請稍後再試。', flags: MessageFlags.Ephemeral };
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(msg);
            }
        } catch (_) {}
    }
}

module.exports = { execute };
