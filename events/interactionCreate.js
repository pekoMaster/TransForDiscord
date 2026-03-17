/**
 * TransForDiscord — 互動路由
 * 只處理 Ermiana 相關的按鈕與斜線指令
 */

const path = require('path');
const fs = require('fs');

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
            if (interaction.customId === 'apikey_set_modal') {
                const apiKey = interaction.fields.getTextInputValue('gemini_api_key').trim();
                if (!apiKey.startsWith('AIzaSy')) {
                    return interaction.reply({
                        content: '❌ API Key 格式不正確，應以 `AIzaSy` 開頭，請確認後重新設定。',
                        ephemeral: true
                    });
                }
                const { saveKey } = require('../utils/user-api-key-storage.js');
                saveKey(interaction.user.id, apiKey);
                return interaction.reply({
                    content: '✅ 已儲存你的個人 Gemini API Key。\n翻譯功能將優先使用你的 Key，不會與他人共用。',
                    ephemeral: true
                });
            }
            return;
        }

        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        const customId = interaction.customId;

        // ── Twitter 按鈕 ──
        if (customId.startsWith('twitter_expand_') || customId.startsWith('twitter_collapse_')) {
            const handler = require('../handlers/twitter-expand-interactions.js');
            return await handler.execute(interaction);
        }

        if (customId.startsWith('twitter_translate_') || customId.startsWith('twitter_original_')) {
            const handler = require('../handlers/twitter-translate-interactions.js');
            return await handler.execute(interaction);
        }

        if (customId.startsWith('twitter_page_')) {
            const handler = require('../handlers/twitter-pagination-interactions.js');
            return await handler.execute(interaction);
        }

        if (customId.startsWith('twitter_')) {
            const handler = require('../handlers/twitter-interactions.js');
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

        // ── 翻譯按鈕 ──
        if (customId.startsWith('translate_')) {
            const handler = require('../handlers/content-translation-interactions.js');
            return await handler.execute(interaction);
        }

    } catch (err) {
        console.error(`[InteractionCreate] 處理錯誤 (${interaction.customId || interaction.commandName}):`, err.message);
        try {
            const msg = { content: '❌ 處理請求時發生錯誤，請稍後再試。', ephemeral: true };
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(msg);
            }
        } catch (_) {}
    }
}

module.exports = { execute };
