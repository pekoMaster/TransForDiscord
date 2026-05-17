const { MessageFlags, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const { buildV2Container } = require('../../containers/v2-container-builder');

function buildV2EditPayload({
    tweet,
    originalURL,
    quoteData = null,
    replyData = null,
    state = {},
    urlStats = null
}) {
    const container = buildV2Container(tweet, originalURL, {
        isTranslated: Boolean(state.isTranslated),
        translatedText: state.translatedText || null,
        translatedQuoteText: state.translatedQuoteText || null,
        translatedReplyText: state.translatedReplyText || null,
        isQuoteShown: Boolean(state.isQuoteShown),
        isReplyShown: Boolean(state.isReplyShown),
        isExpanded: Boolean(state.isExpanded),
        quoteData,
        replyData,
        urlStats
    });

    if (state.markerText) {
        container.components = [
            new TextDisplayBuilder().setContent(state.markerText),
            new SeparatorBuilder().setDivider(true),
            ...container.components
        ];
    }

    return {
        content: null,
        embeds: [],
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    buildV2EditPayload
};
