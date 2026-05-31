const { MessageFlags } = require('discord.js');
const tlog = require('../../../shared/logging/tfd-logger');
const { getGalleryState } = require('../gallery/gallery-cache');
const { buildThreadsGalleryPage } = require('../gallery/gallery-view');
const { appendReportButton } = require('../../../shared/discord/spoiler-button-helper.js');

async function handleThreadsGalleryPagination(interaction) {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    if (parts.length !== 4) return;

    const galleryId = parts[2];
    const page = Number.parseInt(parts[3], 10);
    if (!galleryId || !Number.isFinite(page)) return;

    await interaction.deferUpdate();

    const state = getGalleryState(galleryId);
    if (!state) {
        return interaction.followUp({
            content: '頁面資料已過期，請重新貼上 Threads 網址。',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const view = buildThreadsGalleryPage(state, page);
        await interaction.editReply({
            embeds: view.embeds,
            components: appendReportButton(view.components)
        });
        tlog.sys('Threads翻頁', '成功切換到第 ' + (view.page + 1) + '/' + view.totalPages + ' 頁');
    } catch (error) {
        tlog.sysError('Threads翻頁', '處理失敗: ' + error.message);
        try {
            await interaction.followUp({
                content: '翻頁時發生錯誤，請稍後再試。',
                flags: MessageFlags.Ephemeral
            });
        } catch (_) {}
    }
}

module.exports = {
    handleThreadsGalleryPagination
};
