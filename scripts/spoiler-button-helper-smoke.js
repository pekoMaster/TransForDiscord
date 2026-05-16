const assert = require('assert');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const sharedHelper = require('../src/shared/discord/spoiler-button-helper');
const legacyHelper = require('../utils/spoiler-button-helper');

assert.strictEqual(legacyHelper.appendReportButton, sharedHelper.appendReportButton);
assert.strictEqual(legacyHelper.appendSpoilerButton, sharedHelper.appendSpoilerButton);
assert.strictEqual(sharedHelper.REPORT_BTN_PREFIX, 'report_btn_');
assert.strictEqual(sharedHelper.SPOILER_BTN_ID, 'spoiler_btn');

function button(id) {
    return new ButtonBuilder()
        .setCustomId(id)
        .setLabel(id)
        .setStyle(ButtonStyle.Secondary);
}

const reportRows = sharedHelper.appendReportButton([]);
assert.strictEqual(reportRows.length, 1);
assert.strictEqual(reportRows[0].components.length, 1);
assert.ok(reportRows[0].components[0].data.custom_id.startsWith(sharedHelper.REPORT_BTN_PREFIX));

const noDuplicateReportRows = sharedHelper.appendReportButton(reportRows);
assert.strictEqual(noDuplicateReportRows.length, 1);
assert.strictEqual(noDuplicateReportRows[0].components.length, 1);

const fullRow = new ActionRowBuilder().addComponents(
    button('a'),
    button('b'),
    button('c'),
    button('d'),
    button('e')
);
const appendedRows = sharedHelper.appendSpoilerButton([fullRow]);
assert.strictEqual(appendedRows.length, 2);
assert.strictEqual(appendedRows[1].components[0].data.custom_id, sharedHelper.SPOILER_BTN_ID);

const noDuplicateSpoilerRows = sharedHelper.appendSpoilerButton(appendedRows);
assert.strictEqual(noDuplicateSpoilerRows.length, 2);

console.log('spoiler-button-helper smoke ok');
