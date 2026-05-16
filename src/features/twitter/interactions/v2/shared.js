const { MessageFlags } = require('discord.js');

async function safeInteractionNotice(interaction, content) {
    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        }
    } catch (_) {}
}

function extractTweetId(customId) {
    const parts = customId.split('_');
    return parts[parts.length - 1];
}

function extractMarkerTextFromMessage(message) {
    const contentMarker = message?.content?.split('\n').find(line => line.startsWith('-# <@'));
    if (contentMarker) return contentMarker;

    const origComponents = message?.components;
    if (!origComponents?.[0]?.components?.[0]) return null;

    const first = origComponents[0].components[0];
    if (first.data?.type === 10 || first.type === 10) {
        return first.data?.content || first.content || null;
    }

    return null;
}

module.exports = {
    safeInteractionNotice,
    extractTweetId,
    extractMarkerTextFromMessage
};
