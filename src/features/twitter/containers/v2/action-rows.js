const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { REPORT_BTN_PREFIX } = require('../../../../shared/discord/spoiler-button-helper');

function buildV2ActionRows(tweet, options = {}) {
    const {
        isTranslated = false,
        isQuoteShown = false,
        isReplyShown = false,
        isExpanded = false,
        hasTruncated = false,
        reportId = Date.now()
    } = options;

    const buttons = [];
    const textContent = tweet.text || '';

    if (textContent.trim().length >= 10) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(isTranslated ? `v2_original_${tweet.id}` : `v2_translate_${tweet.id}`)
                .setLabel(isTranslated ? '??' : '蝧餉陌')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    const hasQuote = Boolean(tweet.quote?.author);
    const hasReply = Boolean(tweet.replying_to);
    const hasExpandable = hasQuote || hasReply || hasTruncated;

    if (hasExpandable) {
        const isAllExpanded =
            (!hasQuote || isQuoteShown) &&
            (!hasReply || isReplyShown) &&
            (!hasTruncated || isExpanded);

        buttons.push(
            new ButtonBuilder()
                .setCustomId(isAllExpanded ? `v2_collapse_all_${tweet.id}` : `v2_expand_all_${tweet.id}`)
                .setLabel(isAllExpanded ? '?嗅?' : '撅?')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`v2_reload_${tweet.id}`)
            .setLabel('?')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(REPORT_BTN_PREFIX + reportId)
            .setLabel('?')
            .setStyle(ButtonStyle.Secondary)
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        const rowButtons = buttons.slice(i, i + 5);
        if (rowButtons.length > 0) {
            rows.push(new ActionRowBuilder().addComponents(...rowButtons));
        }
    }

    return rows;
}

module.exports = {
    buildV2ActionRows
};
