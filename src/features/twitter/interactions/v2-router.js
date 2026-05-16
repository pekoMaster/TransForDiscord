/**
 * Twitter V2 Container interaction dispatcher.
 * Detailed action logic lives under ./v2/* so reload, toggle, translation,
 * and spoiler handling all share the same data hydration and view rebuild path.
 */

const { handleV2Translate } = require('./v2/translate-handler');
const { handleV2Toggle } = require('./v2/toggle-handler');
const { handleV2Reload } = require('./v2/reload-handler');
const { handleV2Spoiler, handleV2SpoilerModalSubmit } = require('./v2/spoiler-handler');
const { safeInteractionNotice } = require('./v2/shared');
const tlog = require('../../../../utils/tfd-logger');

async function handleV2Interaction(interaction) {
    if (!interaction.isButton()) return;
    const id = interaction.customId;

    try {
        if (id.startsWith('v2_translate_') || id.startsWith('v2_original_')) {
            await handleV2Translate(interaction);
        } else if (id.startsWith('v2_expand_all_') || id.startsWith('v2_collapse_all_')) {
            await handleV2Toggle(interaction, 'all');
        } else if (id.startsWith('v2_reload_')) {
            await handleV2Reload(interaction);
        } else if (id.startsWith('v2_spoiler_')) {
            await handleV2Spoiler(interaction);
        }
    } catch (error) {
        tlog.sysError('V2-Interactions', `處理互動失敗: ${error.message}`);
        await safeInteractionNotice(interaction, '處理互動失敗，請稍後再試。');
    }
}

module.exports = { handleV2Interaction, handleV2SpoilerModalSubmit };
