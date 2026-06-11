/**
 * Instagram 重整按鈕處理器
 *
 * customId 格式: ig_reload_{originalURL}
 * 重新提取 Instagram 貼文/Reel/Story 並 editReply 更新訊息。
 */

const { MessageFlags } = require('discord.js');
const InstagramExtractor = require('../instagram-extractor');
const tlog = require('../../../../shared/logging/tfd-logger');

const URL_PATTERNS = {
    post:  /instagram\.com\/p\/([A-Za-z0-9_-]+)/i,
    reel:  /instagram\.com\/reels?\/([A-Za-z0-9_-]+)/i,
    story: /instagram\.com\/stories\/([A-Za-z0-9._-]+)\/(\d+)/i,
};

async function handleInstagramReloadInteraction(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    const originalURL = interaction.customId.slice('ig_reload_'.length);
    if (!originalURL) {
        return interaction.followUp({ content: '❌ 無法取得原始網址', flags: MessageFlags.Ephemeral });
    }

    tlog.sys('Instagram重整', `重整請求: ${originalURL}`);

    try {
        const extractor = new InstagramExtractor();
        let result = null;

        const postMatch = originalURL.match(URL_PATTERNS.post);
        const reelMatch = originalURL.match(URL_PATTERNS.reel);
        const storyMatch = originalURL.match(URL_PATTERNS.story);

        if (postMatch) {
            result = await extractor.extractPost(postMatch[1], originalURL, null);
        } else if (reelMatch) {
            result = await extractor.extractReel(reelMatch[1], originalURL, null);
        } else if (storyMatch) {
            result = await extractor.extractStory(storyMatch[1], storyMatch[2], originalURL, null);
        } else {
            return interaction.followUp({ content: '❌ 無法解析 Instagram URL', flags: MessageFlags.Ephemeral });
        }

        if (!result || !result.success) {
            return interaction.followUp({
                content: `❌ 重整失敗: ${result?.error || '無法取得內容'}`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (result.isV2 && result.v2Container) {
            await interaction.editReply({
                components: [result.v2Container],
                flags: MessageFlags.IsComponentsV2,
            });
        } else if (result.embed) {
            await interaction.editReply({
                embeds: [result.embed],
                components: result.components || [],
            });
        } else {
            return interaction.followUp({ content: '❌ 重整後無可用內容', flags: MessageFlags.Ephemeral });
        }

        tlog.sys('Instagram重整', `重整成功: ${originalURL}`);
    } catch (error) {
        tlog.sysError('Instagram重整', `重整失敗: ${error.message}`);
        try {
            await interaction.followUp({ content: '❌ 重整失敗，請稍後再試', flags: MessageFlags.Ephemeral });
        } catch {}
    }
}

module.exports = { handleInstagramReloadInteraction };
