/**
 * Threads 重整按鈕處理器
 * 處理 Threads 貼文的重整按鈕點擊事件
 *
 * v1.0 (2026-05-29): 初始版本
 */

const { MessageFlags } = require('discord.js');
const ThreadsExtractor = require('../../../../tfd-system/extractors/threads.js');
const tlog = require('../../../shared/logging/tfd-logger');

/**
 * 處理 Threads 重整按鈕互動
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleThreadsReloadInteraction(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    try {
        // 從 embed 或 container 中取得原始 URL
        let originalURL = null;

        // V1 embed
        if (interaction.message.embeds && interaction.message.embeds.length > 0) {
            originalURL = interaction.message.embeds[0].url;
        }

        // V2 container (嘗試從 components 中找 URL)
        if (!originalURL && interaction.message.components && interaction.message.components.length > 0) {
            for (const row of interaction.message.components) {
                if (row.components) {
                    for (const comp of row.components) {
                        if (comp.url) {
                            originalURL = comp.url;
                            break;
                        }
                    }
                }
                if (originalURL) break;
            }
        }

        if (!originalURL) {
            return interaction.followUp({
                content: '❌ 無法取得原始網址',
                flags: MessageFlags.Ephemeral
            });
        }

        tlog.sys('Threads重整', `重整請求: ${originalURL}`);

        // 重新提取貼文
        const threadsExtractor = new ThreadsExtractor();

        // 解析 URL 取得 username 和 postId
        const postMatch = originalURL.match(/threads\.com\/@([^/]+)\/post\/([^/?#]+)/);
        if (!postMatch) {
            return interaction.followUp({
                content: '❌ 無法解析 Threads URL',
                flags: MessageFlags.Ephemeral
            });
        }

        const [, username, postId] = postMatch;
        const result = await threadsExtractor.extractPost(username, postId, originalURL);

        if (!result.success) {
            return interaction.followUp({
                content: `❌ 重整失敗: ${result.error || '無法取得貼文'}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 準備回應資料
        const replyData = {};

        if (result.isV2 && result.v2Container) {
            // V2 container (影片)
            replyData.components = result.components || [];
            // 注意: container 需要用不同的方式處理
            // Discord.js 的 editReply 不直接支援 container
            // 需要使用 flags: MessageFlags.IsComponentsV2
            replyData.flags = MessageFlags.IsComponentsV2;
            replyData.components = [result.v2Container, ...(result.components || [])];
        } else {
            // V1 embed
            replyData.embeds = result.embed ? [result.embed] : [];
            replyData.components = result.components || [];
        }

        await interaction.editReply(replyData);
        tlog.sys('Threads重整', `重整成功: ${originalURL}`);

    } catch (error) {
        tlog.sysError('Threads重整', `重整失敗: ${error.message}`);
        try {
            await interaction.followUp({
                content: '❌ 重整失敗，請稍後再試',
                flags: MessageFlags.Ephemeral
            });
        } catch {}
    }
}

module.exports = { handleThreadsReloadInteraction };
