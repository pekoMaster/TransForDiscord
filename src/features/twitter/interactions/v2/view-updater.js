const { MessageFlags } = require('discord.js');
const { resolveRenderState } = require('./render-state');
const { resolveTweetBundle } = require('./tweet-data');
const { buildV2EditPayload } = require('./view-payload');
const { resolveV2UrlStats } = require('./view-stats');
const { getStoredViewState, setStoredViewState } = require('./view-message-state');

async function rebuildAndUpdate(interaction, tweetId, stateOverrides = {}, options = {}) {
    const { refreshData = false } = options;

    const cached = await resolveTweetBundle(tweetId, { refreshData });

    if (!cached) {
        await interaction.followUp({
            content: '找不到推文資料，請重新抓取一次後再試。',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }

    const { tweet, originalURL, quoteData, replyData } = cached;
    const storedState = getStoredViewState(interaction);
    const newState = resolveRenderState({
        interaction,
        tweetId,
        cached,
        storedState,
        stateOverrides
    });

    const urlStats = resolveV2UrlStats({
        interaction,
        tweetId,
        originalURL
    });

    const payload = buildV2EditPayload({
        tweet,
        originalURL,
        quoteData,
        replyData,
        state: newState,
        urlStats
    });

    await interaction.editReply(payload);

    setStoredViewState(interaction, newState);
    return true;
}

module.exports = {
    rebuildAndUpdate
};
