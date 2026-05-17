const { lookupUrl } = require('../../../../shared/analytics/url-stats');

function resolveV2UrlStats({
    interaction,
    tweetId,
    originalURL = null,
    lookup = lookupUrl
}) {
    try {
        if (!interaction?.guildId || !interaction?.channelId) return null;
        const tweetUrl = originalURL || `https://twitter.com/i/status/${tweetId}`;
        return lookup(tweetUrl, interaction.guildId, interaction.channelId);
    } catch (_) {
        return null;
    }
}

module.exports = {
    resolveV2UrlStats
};
