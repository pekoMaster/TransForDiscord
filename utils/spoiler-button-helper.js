/**
 * 防爆雷按鈕共用工具
 * 用於把 🕶️ 防爆雷按鈕統一附加到 tfd-system 轉貼訊息的 components 上
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const SPOILER_BTN_ID = 'spoiler_btn';

/**
 * 檢查 components 中是否已有防爆雷按鈕
 */
function hasSpoilerButton(components) {
    if (!components || !Array.isArray(components)) return false;
    return components.some(row => {
        const rowComps = row.components || [];
        return rowComps.some(c => {
            const id = c.customId || c.data?.custom_id;
            return id === SPOILER_BTN_ID;
        });
    });
}

/**
 * 把防爆雷按鈕附加到 components 陣列
 * - 若最後一行未滿 5 顆，加到該行
 * - 否則新建一行
 * - 已有按鈕則跳過（避免重複）
 *
 * @param {Array} components - 原始 components 陣列（ActionRowBuilder 或 row 物件）
 * @returns {Array} 新的 components 陣列（深複製，避免 mutate 原物件）
 */
function appendSpoilerButton(components) {
    const existing = components || [];
    if (hasSpoilerButton(existing)) {
        return existing.map(row => ActionRowBuilder.from(row));
    }

    const spoilerButton = new ButtonBuilder()
        .setCustomId(SPOILER_BTN_ID)
        .setLabel('防爆雷')
        .setStyle(ButtonStyle.Secondary);

    const rebuilt = existing.map(row => ActionRowBuilder.from(row));
    const lastRow = rebuilt.length > 0 ? rebuilt[rebuilt.length - 1] : null;

    if (lastRow && lastRow.components && lastRow.components.length < 5) {
        lastRow.addComponents(spoilerButton);
    } else {
        rebuilt.push(new ActionRowBuilder().addComponents(spoilerButton));
    }

    return rebuilt;
}

module.exports = {
    SPOILER_BTN_ID,
    hasSpoilerButton,
    appendSpoilerButton
};
