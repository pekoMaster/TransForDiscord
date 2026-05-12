/**
 * 回報按鈕共用工具
 * 用於把 📋 回報按鈕統一附加到 tfd-system 轉貼訊息的 components 上
 * 支援 V2 Container (ContainerBuilder) 與傳統 ActionRow
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const REPORT_BTN_PREFIX = 'report_btn_';
const SPOILER_BTN_ID = 'spoiler_btn'; // retained for backward compatibility

/**
 * 檢查 components 中是否已有回報按鈕
 */
function hasReportButton(components) {
    if (!components || !Array.isArray(components)) return false;
    return components.some(row => {
        const rowComps = row.components || [];
        return rowComps.some(c => {
            const id = c.customId || c.data?.custom_id;
            return id && id.startsWith(REPORT_BTN_PREFIX);
        });
    });
}

/**
 * 檢查 components 中是否已有防爆雷按鈕（舊格式，向後相容）
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
 * 把回報按鈕附加到 components 陣列（支援傳統 ActionRow）
 *
 * @param {Array} components - 原始 components 陣列
 * @param {Object} [options]
 * @param {string} [options.label] - 按鈕文字（預設 📋 回報）
 * @returns {Array} 新的 components 陣列（深複製）
 */
function appendReportButton(components, { label = '回報' } = {}) {
    const existing = components || [];
    if (hasReportButton(existing)) {
        return existing.map(row => ActionRowBuilder.from(row));
    }

    const reportButton = new ButtonBuilder()
        .setCustomId(REPORT_BTN_PREFIX + Date.now())
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary);

    const rebuilt = existing.map(row => ActionRowBuilder.from(row));
    const lastRow = rebuilt.length > 0 ? rebuilt[rebuilt.length - 1] : null;

    if (lastRow && lastRow.components && lastRow.components.length < 5) {
        lastRow.addComponents(reportButton);
    } else {
        rebuilt.push(new ActionRowBuilder().addComponents(reportButton));
    }

    return rebuilt;
}

/**
 * 向後相容：舊的防爆雷按鈕附加（之後會被 report 按鈕完全取代）
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
    REPORT_BTN_PREFIX,
    SPOILER_BTN_ID,
    hasReportButton,
    hasSpoilerButton,
    appendReportButton,
    appendSpoilerButton
};
