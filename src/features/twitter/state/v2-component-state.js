function deriveStateFromComponents(components, tweetId) {
    const state = {
        isTranslated: false,
        isQuoteShown: false,
        isReplyShown: false,
        isExpanded: false
    };

    function findButtons(items) {
        if (!items) return;
        for (const item of items) {
            const id = item.customId || item.custom_id;
            if (id) {
                if (id === `v2_original_${tweetId}`) state.isTranslated = true;
                if (id === `v2_collapse_all_${tweetId}`) {
                    state.isQuoteShown = true;
                    state.isReplyShown = true;
                    state.isExpanded = true;
                }
                if (id === `v2_hide_quote_${tweetId}`) state.isQuoteShown = true;
                if (id === `v2_hide_reply_${tweetId}`) state.isReplyShown = true;
                if (id === `v2_collapse_${tweetId}`) state.isExpanded = true;
            }
            if (item.components) findButtons(item.components);
        }
    }

    findButtons(components);
    return state;
}

module.exports = {
    deriveStateFromComponents
};
