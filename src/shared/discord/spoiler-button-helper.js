const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const REPORT_BTN_PREFIX = 'report_btn_';
const SPOILER_BTN_ID = 'spoiler_btn'; // retained for backward compatibility

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
