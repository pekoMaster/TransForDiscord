const { MessageFlags } = require('discord.js');
const { lookupUrl } = require('../../../../shared/analytics/url-stats');
const { getMessageState, setMessageState } = require('../../state/v2-state-store');
const { buildFallbackState, resolveRenderState } = require('./render-state');
const { resolveTweetBundle } = require('./tweet-data');
const { buildV2EditPayload } = require('./view-payload');

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
    const storedState = getMessageState(interaction.message.id);
    const newState = resolveRenderState({
        interaction,
        tweetId,
        cached,
        storedState,
        stateOverrides
    });

    let urlStats = null;
    try {
        const tweetUrl = originalURL || `https://twitter.com/i/status/${tweetId}`;
        if (interaction.guildId && interaction.channelId) {
            urlStats = lookupUrl(tweetUrl, interaction.guildId, interaction.channelId);
        }
    } catch (_) {}

    const payload = buildV2EditPayload({
        tweet,
        originalURL,
        quoteData,
        replyData,
        state: newState,
        urlStats
    });

    await interaction.editReply(payload);

    setMessageState(interaction.message.id, newState);
    return true;
}

module.exports = {
    buildFallbackState,
    rebuildAndUpdate
};
