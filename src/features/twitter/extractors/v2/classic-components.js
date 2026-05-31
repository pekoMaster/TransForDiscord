const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PAGINATION_TYPES = ['multi-image', 'reply-with-media', 'video-with-images'];

function buildPaginationButtons(tweet, tweetType, extractImagesFromTweet) {
    if (!PAGINATION_TYPES.includes(tweetType)) {
        return null;
    }

    try {
        const images = extractImagesFromTweet(tweet);
        if (images.length <= 1) {
            return null;
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`twitter_first_${tweet.id}_0`)
                    .setLabel('⏪')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`twitter_prev_${tweet.id}_0`)
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`twitter_page_${tweet.id}_0`)
                    .setLabel('1 / ' + images.length)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`twitter_next_${tweet.id}_1`)
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`twitter_last_${tweet.id}_${images.length - 1}`)
                    .setLabel('⏩')
                    .setStyle(ButtonStyle.Secondary)
            );

        return [row];
    } catch (error) {
        return null;
    }
}

function buildExpandToggleButtonComponent(tweetId, isExpanded) {
    return new ButtonBuilder()
        .setCustomId(isExpanded ? `twitter_collapse_${tweetId}` : `twitter_expand_${tweetId}`)
        .setLabel(isExpanded ? '縮回全文' : '展開全文')
        .setStyle(ButtonStyle.Secondary);
}

function buildAllToggleButtonComponent(tweetId, isAllExpanded) {
    return new ButtonBuilder()
        .setCustomId(isAllExpanded ? `twitter_collapse_all_${tweetId}` : `twitter_expand_all_${tweetId}`)
        .setLabel(isAllExpanded ? '縮回' : '展開')
        .setStyle(ButtonStyle.Secondary);
}

function buildTranslateButtonComponent(tweetId, isTranslated) {
    return new ButtonBuilder()
        .setCustomId(isTranslated ? `twitter_original_${tweetId}` : `twitter_translate_${tweetId}`)
        .setLabel(isTranslated ? '原文' : '翻譯')
        .setStyle(ButtonStyle.Secondary);
}

function addTranslateButtonToComponents(components, tweet, buildTranslateButton) {
    const textContent = tweet.text || '';
    if (textContent.trim().length < 10) {
        return components;
    }

    const translateButton = buildTranslateButton(tweet.id, false);

    if (!components || components.length === 0) {
        return [new ActionRowBuilder().addComponents(translateButton)];
    }

    const firstRow = components[0];
    if (firstRow && firstRow.components && firstRow.components.length < 5) {
        const newFirstRow = new ActionRowBuilder().addComponents(
            translateButton,
            ...firstRow.components
        );
        return [newFirstRow, ...components.slice(1)];
    }

    if (components.length < 5) {
        const newRow = new ActionRowBuilder().addComponents(translateButton);
        return [newRow, ...components];
    }

    return components;
}

function buildReloadButtonComponent(tweetId) {
    return new ButtonBuilder()
        .setCustomId(`twitter_reload_${tweetId}`)
        .setLabel('重整')
        .setStyle(ButtonStyle.Secondary);
}

module.exports = {
    buildPaginationButtons,
    buildExpandToggleButtonComponent,
    buildAllToggleButtonComponent,
    buildTranslateButtonComponent,
    addTranslateButtonToComponents,
    buildReloadButtonComponent,
};
