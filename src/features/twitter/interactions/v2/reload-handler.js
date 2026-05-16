const { MessageFlags } = require('discord.js');
const tlog = require('../../../../../utils/tfd-logger');
const { extractTweetId } = require('./shared');
const { rebuildAndUpdate } = require('./view-updater');

async function handleV2Reload(interaction) {
    const tweetId = extractTweetId(interaction.customId);
    await interaction.deferUpdate();

    try {
        const updated = await rebuildAndUpdate(interaction, tweetId, {}, { refreshData: true });
        if (updated) {
            tlog.log('V2-重整', interaction, `重整完成: ${tweetId}`);
        }
    } catch (error) {
        tlog.sysError('V2-Interactions', `重整失敗: ${error.message}`);
        await interaction.followUp({
            content: '重整失敗，請稍後再試。',
            flags: MessageFlags.Ephemeral
        });
    }
}

module.exports = {
    handleV2Reload
};
