/**
 * Threads 展開/縮回按鈕處理器
 * 處理內文超過 100 中文字 OR 100 英數字元時的「展開」按鈕
 * 截斷狀態存在 gallery-cache 內，customId 帶 galleryId
 *
 * v1.0 (2026-06-05): 初始版本
 */

const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const tlog = require('../../../shared/logging/tfd-logger');
const { getGalleryState } = require('../gallery/gallery-cache');
const { appendReportButton } = require('../../../shared/discord/spoiler-button-helper.js');
const { truncateText } = require('../../../shared/text/text-truncator');

async function handleThreadsExpandCollapse(interaction) {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    const isExpand = customId.startsWith('threads_expand_');
    const isCollapse = customId.startsWith('threads_collapse_');
    if (!isExpand && !isCollapse) return;

    const galleryId = customId.replace(/^threads_(expand|collapse)_/, '');

    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
        }

        const state = getGalleryState(galleryId);
        if (!state || state.type !== 'threads_expand') {
            return interaction.followUp({
                content: '⏰ **資料已過期**，請重新貼上 Threads 網址。',
                flags: MessageFlags.Ephemeral
            });
        }

        const { r, fullDescription, originalURL } = state;

        // 展開：完整內文（截到 Discord 4096 限制以內）；縮回：截斷內容
        let description;
        if (isExpand) {
            description = fullDescription.length > 3800
                ? fullDescription.substring(0, 3800) + '...'
                : fullDescription;
        } else {
            description = truncateText(fullDescription, { placeholder: '' }).text;
        }

        // 重建 embed：保留原 embed 的所有欄位，只換 description
        const currentEmbed = interaction.message.embeds[0];
        if (!currentEmbed) {
            return interaction.followUp({
                content: '❌ 找不到原始 embed',
                flags: MessageFlags.Ephemeral
            });
        }

        const newEmbed = EmbedBuilder.from(currentEmbed).setDescription(description || null);

        // 重建按鈕列：保留原 row（重整 / 回報），切換展開/縮回
        const newComponents = [];
        for (const row of interaction.message.components || []) {
            const newRow = new ActionRowBuilder();
            for (const component of row.components || []) {
                // discord.js v14: ButtonBuilder 的 customId 在 data.custom_id（snake_case）
                const id = component.data && component.data.custom_id;
                if (id && id.startsWith('threads_expand_')) {
                    newRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`threads_collapse_${galleryId}`)
                            .setLabel('縮回')
                            .setStyle(ButtonStyle.Secondary)
                    );
                } else if (id && id.startsWith('threads_collapse_')) {
                    newRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`threads_expand_${galleryId}`)
                            .setLabel('展開')
                            .setStyle(ButtonStyle.Secondary)
                    );
                } else {
                    newRow.addComponents(ButtonBuilder.from(component));
                }
            }
            newComponents.push(newRow);
        }

        await interaction.editReply({ embeds: [newEmbed], components: newComponents });
        tlog.sys('Threads展開', `${isExpand ? '展開' : '縮回'}: ${originalURL}`);
    } catch (error) {
        tlog.sysError('Threads展開', `處理失敗: ${error.message}`);
        try {
            if (!interaction.replied) {
                await interaction.followUp({
                    content: '❌ 展開時發生錯誤，請稍後再試。',
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (_) {}
    }
}

module.exports = {
    handleThreadsExpandCollapse
};
